import { describe, it, expect } from "vitest";
import { RateLimiter, normalizeIdentifier } from "@/lib/rate-limit/limiter";
import { DEFAULT_POLICY } from "@/lib/rate-limit/policy";
import { MemoryStore, ResilientStore, type CounterStore } from "@/lib/rate-limit/store";
import { RateLimitedException, ServiceUnavailableException } from "@/lib/api-response";
import type { ClientIp } from "@/lib/rate-limit/client-ip";

const ipOf = (a: string): ClientIp => ({ address: a, bucket: a });
const UNKNOWN: ClientIp = { address: null, bucket: "unknown" };
const SECRET = "test-secret-test-secret-test-secret-123";

function setup(policy = DEFAULT_POLICY) {
  let t = 10_000_000;
  const store = new MemoryStore(() => t);
  const blocked: Array<{ endpoint: string; scope: string }> = [];
  const limiter = new RateLimiter({ store, policy, secret: SECRET, onBlocked: (e) => blocked.push(e) });
  return { limiter, store, blocked, advance: (ms: number) => { t += ms; } };
}
const reason = async (p: Promise<unknown>) => p.then(() => null, (e) => e);

describe("per-IP limit (every public endpoint)", () => {
  it("admits exactly `max` requests, then 429s with a Retry-After inside the window", async () => {
    const { limiter } = setup();
    const max = DEFAULT_POLICY.signup.ip.max;
    for (let i = 0; i < max; i++) await limiter.enforceIp("signup", ipOf("203.0.113.1"));
    const e = await reason(limiter.enforceIp("signup", ipOf("203.0.113.1")));
    expect(e).toBeInstanceOf(RateLimitedException);
    expect(e.code).toBe("RATE_LIMITED");
    expect(e.retryAfterSeconds).toBeGreaterThan(0);
    expect(e.retryAfterSeconds).toBeLessThanOrEqual(DEFAULT_POLICY.signup.ip.windowSeconds);
  });
  it("Retry-After counts down with the window and the window ends on its own", async () => {
    const { limiter, advance } = setup();
    const w = DEFAULT_POLICY.contact.ip.windowSeconds;
    for (let i = 0; i < DEFAULT_POLICY.contact.ip.max; i++) await limiter.enforceIp("contact", ipOf("203.0.113.2"));
    advance(1_000 * (w - 100));
    const e = await reason(limiter.enforceIp("contact", ipOf("203.0.113.2")));
    expect(e.retryAfterSeconds).toBeLessThanOrEqual(100);
    advance(1_000 * 101);
    await expect(limiter.enforceIp("contact", ipOf("203.0.113.2"))).resolves.toBeUndefined();
  });
  it("traffic during the block does NOT extend it (no way to keep someone locked out by hammering)", async () => {
    const { limiter, advance } = setup();
    const w = DEFAULT_POLICY.demoGenerate.ip.windowSeconds;
    for (let i = 0; i < DEFAULT_POLICY.demoGenerate.ip.max; i++) await limiter.enforceIp("demoGenerate", ipOf("203.0.113.3"));
    for (let i = 0; i < 50; i++) { advance(1_000); await reason(limiter.enforceIp("demoGenerate", ipOf("203.0.113.3"))); }
    advance(1_000 * w); // exactly one window after the FIRST request, regardless of the 50 refused ones
    await expect(limiter.enforceIp("demoGenerate", ipOf("203.0.113.3"))).resolves.toBeUndefined();
  });
  it("addresses and endpoints are independent", async () => {
    const { limiter } = setup();
    for (let i = 0; i < DEFAULT_POLICY.signup.ip.max; i++) await limiter.enforceIp("signup", ipOf("203.0.113.4"));
    await expect(limiter.enforceIp("signup", ipOf("203.0.113.5"))).resolves.toBeUndefined();
    await expect(limiter.enforceIp("forgotPassword", ipOf("203.0.113.4"))).resolves.toBeUndefined();
  });
  it("an unidentifiable client shares ONE bucket per endpoint with a scaled flood ceiling, not a per-client limit", async () => {
    const { limiter } = setup();
    const ceiling = DEFAULT_POLICY.signup.ip.max * DEFAULT_POLICY.unknownIpMultiplier;
    for (let i = 0; i < ceiling; i++) await limiter.enforceIp("signup", UNKNOWN);
    expect(await reason(limiter.enforceIp("signup", UNKNOWN))).toBeInstanceOf(RateLimitedException);
  });
  it("parallel requests cannot exceed the limit: exactly `max` of 200 concurrent calls are admitted", async () => {
    const { limiter } = setup();
    const max = DEFAULT_POLICY.forgotPassword.ip.max;
    const results = await Promise.allSettled(Array.from({ length: 200 }, () => limiter.enforceIp("forgotPassword", ipOf("203.0.113.6"))));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(max);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(200 - max);
  });
});

describe("per-e-mail limits", () => {
  it("allowEmail reports instead of throwing, so forgot-password can keep its response identical", async () => {
    const { limiter } = setup();
    const max = DEFAULT_POLICY.forgotPassword.email.max;
    const seen: boolean[] = [];
    for (let i = 0; i < max + 2; i++) seen.push(await limiter.allowEmail("forgotPassword", "a@example.test"));
    expect(seen).toEqual([...Array(max).fill(true), false, false]);
  });
  it("enforceEmail throws the same RateLimitedException", async () => {
    const { limiter } = setup();
    for (let i = 0; i < DEFAULT_POLICY.signup.email.max; i++) await limiter.enforceEmail("signup", "a@example.test");
    expect(await reason(limiter.enforceEmail("signup", "a@example.test"))).toBeInstanceOf(RateLimitedException);
  });
  it("case, whitespace and Unicode compatibility variants all hit ONE counter (no bypass by re-spelling the identifier)", async () => {
    const { limiter } = setup();
    const variants = ["user@example.test", "  USER@Example.TEST ", "User@EXAMPLE.test", "ｕｓｅｒ@ｅｘａｍｐｌｅ.test"];
    expect(new Set(variants.map(normalizeIdentifier)).size).toBe(1);
    const results: boolean[] = [];
    for (let i = 0; i < 8; i++) results.push(await limiter.allowEmail("contact", variants[i % variants.length]!));
    expect(results.filter(Boolean)).toHaveLength(DEFAULT_POLICY.contact.email.max);
  });
  it("different e-mails and different endpoints do not share counters", async () => {
    const { limiter } = setup();
    for (let i = 0; i < DEFAULT_POLICY.contact.email.max; i++) await limiter.allowEmail("contact", "a@example.test");
    expect(await limiter.allowEmail("contact", "b@example.test")).toBe(true);
    expect(await limiter.allowEmail("signup", "a@example.test")).toBe(true);
  });
  it("keys contain no e-mail, no IP and no readable identifier", async () => {
    const { limiter, store } = setup();
    await limiter.enforceIp("login", ipOf("203.0.113.77"));
    await limiter.beginLogin(ipOf("203.0.113.77"), "victim@example.test");
    await limiter.allowEmail("forgotPassword", "victim@example.test");
    const keys = store.keys().join("\n");
    expect(keys).not.toMatch(/victim|example\.test/i);
    // only the per-IP key carries the address (that is what it is keyed on); every account/pair/known/e-mail key is a keyed hash
    expect(store.keys().filter((k) => k.includes("203.0.113.77"))).toEqual(["rl:v1:login:ip:203.0.113.77"]);
    for (const k of store.keys().filter((k) => !k.includes(":ip:"))) expect(k).toMatch(/^rl:v1:[a-zA-Z]+:[a-z]+:[0-9a-f]{32}$/);
  });
});

describe("login: brute-force control without permanent lockout", () => {
  const P = DEFAULT_POLICY.login;
  it("allows `accountIp.max` guesses per account+IP, then blocks that pair", async () => {
    const { limiter } = setup();
    for (let i = 0; i < P.accountIp.max; i++) await limiter.beginLogin(ipOf("198.51.100.1"), "a@example.test");
    const e = await reason(limiter.beginLogin(ipOf("198.51.100.1"), "a@example.test"));
    expect(e).toBeInstanceOf(RateLimitedException);
    expect(e.retryAfterSeconds).toBeLessThanOrEqual(P.accountIp.windowSeconds);
  });
  it("the block ends by itself and attempts while blocked do not extend it", async () => {
    const { limiter, advance } = setup();
    for (let i = 0; i < P.accountIp.max; i++) await limiter.beginLogin(ipOf("198.51.100.1"), "a@example.test");
    for (let i = 0; i < 30; i++) { advance(10_000); await reason(limiter.beginLogin(ipOf("198.51.100.1"), "a@example.test")); }
    advance(1_000 * P.accountIp.windowSeconds);
    await expect(limiter.beginLogin(ipOf("198.51.100.1"), "a@example.test")).resolves.toBeDefined();
  });
  it("a successful login clears the account+IP counter, so a person who mistyped is not punished afterwards", async () => {
    const { limiter } = setup();
    for (let i = 0; i < P.accountIp.max - 1; i++) await limiter.beginLogin(ipOf("198.51.100.2"), "a@example.test");
    const last = await limiter.beginLogin(ipOf("198.51.100.2"), "a@example.test");
    await last.succeeded();
    for (let i = 0; i < P.accountIp.max; i++) await limiter.beginLogin(ipOf("198.51.100.2"), "a@example.test");
  });
  it("an attacker's block on the owner's account does not lock the owner out from the owner's own address", async () => {
    const { limiter } = setup();
    const owner = ipOf("198.51.100.10"); const attacker = ipOf("192.0.2.66");
    await (await limiter.beginLogin(owner, "owner@example.test")).succeeded(); // owner has logged in from here before
    for (let i = 0; i < P.accountIp.max; i++) await limiter.beginLogin(attacker, "owner@example.test");
    expect(await reason(limiter.beginLogin(attacker, "owner@example.test"))).toBeInstanceOf(RateLimitedException); // attacker blocked
    await expect(limiter.beginLogin(owner, "owner@example.test")).resolves.toBeDefined(); // owner not
  });
  it("distributed guessing: after `accountUnrecognizedIp.max` attempts from unrecognised addresses further unrecognised ones are refused, recognised ones are not", async () => {
    const { limiter } = setup();
    const owner = ipOf("198.51.100.10");
    await (await limiter.beginLogin(owner, "owner@example.test")).succeeded();
    for (let i = 0; i < P.accountUnrecognizedIp.max; i++) await limiter.beginLogin(ipOf(`192.0.2.${i + 1}`), "owner@example.test");
    expect(await reason(limiter.beginLogin(ipOf("192.0.2.200"), "owner@example.test"))).toBeInstanceOf(RateLimitedException);
    await expect(limiter.beginLogin(owner, "owner@example.test")).resolves.toBeDefined(); // known address still works
    expect(await reason(limiter.beginLogin(ipOf("198.51.100.99"), "owner@example.test"))).toBeInstanceOf(RateLimitedException); // owner on a NEW address waits out the window
  });
  it("a successful login from a new address stops counting against the account-wide limit", async () => {
    const { limiter } = setup();
    for (let round = 0; round < P.accountUnrecognizedIp.max * 2; round++) {
      await (await limiter.beginLogin(ipOf(`203.0.113.${(round % 200) + 1}`), `u${round}@example.test`)).succeeded();
    }
    // 40 distinct accounts: no account-wide counter reached its limit because each success decremented its own counter
    const one = ipOf("203.0.113.250");
    for (let i = 0; i < P.accountUnrecognizedIp.max; i++) await (await limiter.beginLogin(one, "solo@example.test")).succeeded();
  });
  it("parallel guesses cannot beat the limit: exactly `accountIp.max` of 100 concurrent attempts are admitted", async () => {
    const { limiter } = setup();
    const results = await Promise.allSettled(Array.from({ length: 100 }, () => limiter.beginLogin(ipOf("198.51.100.3"), "a@example.test")));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(P.accountIp.max);
  });
  it("identifier variants share the account counters (no bypass by re-spelling the e-mail)", async () => {
    const { limiter } = setup();
    const variants = ["a@example.test", "A@EXAMPLE.TEST", " a@example.test ", "ａ@ｅｘａｍｐｌｅ.test"];
    const out = await Promise.allSettled(Array.from({ length: P.accountIp.max + 3 }, (_, i) => limiter.beginLogin(ipOf("198.51.100.4"), variants[i % 4]!)));
    expect(out.filter((r) => r.status === "fulfilled")).toHaveLength(P.accountIp.max);
  });
  it("many different addresses cannot be used to flood one address's counter into another's", async () => {
    const { limiter } = setup();
    // the route runs enforceIp("login") first, then beginLogin; model that
    const attempt = async (ip: ClientIp, email: string) => { await limiter.enforceIp("login", ip); return limiter.beginLogin(ip, email); };
    for (let i = 0; i < P.ip.max; i++) await attempt(ipOf("198.51.100.5"), `x${i}@example.test`);
    expect(await reason(attempt(ipOf("198.51.100.5"), "fresh@example.test"))).toBeInstanceOf(RateLimitedException); // per-IP flood limit
    await expect(attempt(ipOf("198.51.100.6"), "fresh@example.test")).resolves.toBeDefined();
  });
  it("an unidentifiable client is never 'recognised': one success must not exempt every other unknown client", async () => {
    const { limiter, store } = setup();
    await (await limiter.beginLogin(UNKNOWN, "a@example.test")).succeeded();
    expect(store.keys().some((k) => k.includes(":known:"))).toBe(false);
  });
});

describe("each login attempt is counted ONCE per counter (regression: the IP counter was incremented twice)", () => {
  it("the per-IP counter advances by exactly one per attempt when the route's enforceIp and beginLogin are both called", async () => {
    const { limiter } = setup();
    const ip = ipOf("198.51.100.15");
    const P = DEFAULT_POLICY.login;
    for (let i = 0; i < P.ip.max; i++) {
      await limiter.enforceIp("login", ip);
      await limiter.beginLogin(ip, `user${i}@example.test`); // distinct accounts: only the IP counter can trip
    }
    expect(await reason(limiter.enforceIp("login", ip))).toBeInstanceOf(RateLimitedException); // the (max+1)th, not the (max/2+1)th
  });
});

describe("account enumeration: refusals are identical whether or not the account exists", () => {
  it("the limiter never learns whether an account exists, and its refusal carries no identifier", async () => {
    const { limiter } = setup();
    for (let i = 0; i < DEFAULT_POLICY.login.accountIp.max; i++) {
      await limiter.beginLogin(ipOf("198.51.100.7"), "exists@example.test");
      await limiter.beginLogin(ipOf("198.51.100.8"), "nobody@example.test");
    }
    const a = await reason(limiter.beginLogin(ipOf("198.51.100.7"), "exists@example.test"));
    const b = await reason(limiter.beginLogin(ipOf("198.51.100.8"), "nobody@example.test"));
    expect([a.name, a.code, a.message]).toEqual([b.name, b.code, b.message]);
    expect(a.message).not.toMatch(/example|account|exists|locked|password/i);
  });
});

describe("failure handling", () => {
  it("succeeded() never throws, even if the store fails after a correct password", async () => {
    const real = new MemoryStore();
    const flaky: CounterStore = { ...real, hit: (k, w) => real.hit(k, w), hasFlag: (k) => real.hasFlag(k), decrFloor: () => Promise.reject(new Error("x")), del: () => Promise.reject(new Error("x")), setFlag: () => Promise.reject(new Error("x")) };
    const limiter = new RateLimiter({ store: flaky, policy: DEFAULT_POLICY, secret: SECRET });
    const attempt = await limiter.beginLogin(ipOf("198.51.100.9"), "a@example.test");
    await expect(attempt.succeeded()).resolves.toBeUndefined();
  });
  it("deny mode surfaces a 503 from the limiter (fail closed), memory mode keeps limiting", async () => {
    const down: CounterStore = { hit: () => Promise.reject(new Error("d")), decrFloor: () => Promise.reject(new Error("d")), del: () => Promise.reject(new Error("d")), setFlag: () => Promise.reject(new Error("d")), hasFlag: () => Promise.reject(new Error("d")) };
    const deny = new RateLimiter({ store: new ResilientStore({ primary: down, fallback: new MemoryStore(), onFailure: "deny" }), policy: DEFAULT_POLICY, secret: SECRET });
    expect(await reason(deny.enforceIp("signup", ipOf("203.0.113.9")))).toBeInstanceOf(ServiceUnavailableException);
    const mem = new RateLimiter({ store: new ResilientStore({ primary: down, fallback: new MemoryStore(), onFailure: "memory" }), policy: DEFAULT_POLICY, secret: SECRET });
    for (let i = 0; i < DEFAULT_POLICY.signup.ip.max; i++) await mem.enforceIp("signup", ipOf("203.0.113.9"));
    expect(await reason(mem.enforceIp("signup", ipOf("203.0.113.9")))).toBeInstanceOf(RateLimitedException);
  });
  it("onBlocked receives only the endpoint and scope", async () => {
    const { limiter, blocked } = setup();
    for (let i = 0; i < DEFAULT_POLICY.signup.ip.max + 1; i++) await reason(limiter.enforceIp("signup", ipOf("203.0.113.10")));
    expect(blocked).toEqual([{ endpoint: "signup", scope: "ip" }]);
  });
});
