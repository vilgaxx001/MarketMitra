/**
 * REAL-Redis integration test for the rate limiter store and limiter (Pre-5C release gate).
 *
 * Runs only when REDIS_INTEGRATION_URL points at a DISPOSABLE Redis (it uses logical database 5 and FLUSHES it at the end;
 * never point it at production). Without that variable the whole file is skipped
 * and reported as skipped, not as passed. CI sets it, and the gate fails if anything is skipped.
 *
 *   redis-server --port 63799 --save "" --appendonly no --daemonize yes
 *   REDIS_INTEGRATION_URL=redis://127.0.0.1:63799 npx vitest run src/lib/rate-limit/__tests__/redis.integration.test.ts
 *
 * Uses the REAL ioredis client, the REAL Lua scripts, two independent connections (standing in for two app instances), and a
 * connection to a closed port for the outage cases.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import Redis from "ioredis";
import { MemoryStore, RedisStore, ResilientStore } from "@/lib/rate-limit/store";
import { RateLimiter } from "@/lib/rate-limit/limiter";
import { DEFAULT_POLICY, parsePolicy } from "@/lib/rate-limit/policy";
import { RateLimitedException, ServiceUnavailableException } from "@/lib/api-response";

const URL_ = process.env.REDIS_INTEGRATION_URL;
const d = URL_ ? describe : describe.skip;
const ip = (a: string) => ({ address: a, bucket: a });
const run = randomUUID();
const secret = `itest-secret-${run}-${run}`;
const k = (n: string) => `rl:itest:${run}:${n}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

d("rate limiter against a real Redis", () => {
  let admin: Redis; let instA: Redis; let instB: Redis;
  beforeAll(async () => {
    // Own logical database: other integration files run in parallel against the same Redis and must not see (or delete) these keys.
    admin = new Redis(URL_!, { db: 5 }); instA = new Redis(URL_!, { db: 5 }); instB = new Redis(URL_!, { db: 5 });
    await Promise.all([admin.ping(), instA.ping(), instB.ping()]);
  });
  afterAll(async () => {
    await admin.flushdb(); // db 5 is private to this file
    admin.disconnect(); instA.disconnect(); instB.disconnect();
  });

  describe("RedisStore.hit (Lua sliding-window log)", () => {
    it("admits exactly `max`, refuses without recording, sets an expiry of at most one window and never lengthens it by refusing", async () => {
      const s = new RedisStore(instA);
      for (let i = 1; i <= 3; i++) expect(await s.hit(k("basic"), 30, 3)).toMatchObject({ allowed: true, count: i, retryAfterMs: 0 });
      const t1 = await admin.pttl(k("basic"));
      expect(t1).toBeGreaterThan(0); expect(t1).toBeLessThanOrEqual(30_000);
      await sleep(200);
      for (let i = 0; i < 25; i++) expect((await s.hit(k("basic"), 30, 3)).allowed).toBe(false);
      expect(await admin.zcard(k("basic"))).toBe(3); // refused requests recorded nothing
      expect(await admin.pttl(k("basic"))).toBeLessThan(t1); // and did not restart the clock
      const refused = await s.hit(k("basic"), 30, 3);
      expect(refused.retryAfterMs).toBeGreaterThan(29_000); expect(refused.retryAfterMs).toBeLessThanOrEqual(30_000);
    });
    it("is atomic under concurrency from two connections: 200 parallel hits against max=50 admit exactly 50", async () => {
      const a = new RedisStore(instA); const b = new RedisStore(instB);
      const res = await Promise.all(Array.from({ length: 200 }, (_, i) => (i % 2 ? a : b).hit(k("conc"), 30, 50)));
      expect(res.filter((r) => r.allowed)).toHaveLength(50);
      expect(res.filter((r) => r.allowed).map((r) => r.count).sort((x, y) => x - y)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
      expect(await admin.zcard(k("conc"))).toBe(50);
      expect(await admin.pttl(k("conc"))).toBeGreaterThan(0);
    });
    it("the window SLIDES in real time and Retry-After is exact", async () => {
      const s = new RedisStore(instA);
      await s.hit(k("slide"), 1, 2); await s.hit(k("slide"), 1, 2);
      const refused = await s.hit(k("slide"), 1, 2);
      expect(refused.allowed).toBe(false); expect(refused.retryAfterMs).toBeGreaterThan(0); expect(refused.retryAfterMs).toBeLessThanOrEqual(1_000);
      await sleep(refused.retryAfterMs + 60);
      expect((await s.hit(k("slide"), 1, 2)).allowed).toBe(true);
    });
    it("REGRESSION (fixed-window 2x burst) against the real script: a burst at the end of a window and another right after it admit `max` in total, not 2x", async () => {
      const s = new RedisStore(instA); const MAX = 3; const WINDOW_S = 2;
      expect((await s.hit(k("burst"), WINDOW_S, MAX)).allowed).toBe(true); // t=0: "opens" what a fixed window would call window 1
      await sleep(1_700);
      const nearEnd = await Promise.all(Array.from({ length: 6 }, () => s.hit(k("burst"), WINDOW_S, MAX)));
      await sleep(450); // t~2.15 s: a fixed window would have restarted; the t=0 entry (only) has left the sliding window
      const justAfter = await Promise.all(Array.from({ length: 6 }, () => s.hit(k("burst"), WINDOW_S, MAX)));
      expect(nearEnd.filter((r) => r.allowed)).toHaveLength(MAX - 1);
      expect(justAfter.filter((r) => r.allowed)).toHaveLength(1);
    });
    it("the key disappears once its window has passed (no state outlives its usefulness)", async () => {
      await new RedisStore(instA).hit(k("gone"), 1, 5);
      await sleep(1_200);
      expect(await admin.exists(k("gone"))).toBe(0);
    });
    it("heals a stranded entry set without an expiry: stale entries age out and the next admission sets the TTL", async () => {
      await admin.zadd(k("stranded"), Date.now() - 3_600_000, "ancient"); // no TTL, entry far outside any window
      expect(await admin.pttl(k("stranded"))).toBe(-1);
      expect(await new RedisStore(instA).hit(k("stranded"), 20, 1)).toMatchObject({ allowed: true, count: 1 });
      expect(await admin.pttl(k("stranded"))).toBeGreaterThan(0);
    });
    it("uses the SERVER clock: a request is admitted again exactly when Redis says the oldest entry leaves", async () => {
      const s = new RedisStore(instA);
      await s.hit(k("clock"), 60, 1);
      const [score] = (await admin.zrange(k("clock"), 0, 0, "WITHSCORES")).slice(1).map(Number);
      const [secs, micros] = (await admin.time()).map(Number);
      expect(Math.abs(score! - (secs! * 1000 + Math.floor(micros! / 1000)))).toBeLessThan(2_000);
    });
    it("refund removes the NEWEST entry only, never errors on an empty key; reset removes the key", async () => {
      const s = new RedisStore(instA);
      await s.hit(k("ref"), 60, 5); await sleep(5); await s.hit(k("ref"), 60, 5); await sleep(5); await s.hit(k("ref"), 60, 5);
      const before = await admin.zrange(k("ref"), 0, -1, "WITHSCORES");
      await s.refund(k("ref"));
      const after = await admin.zrange(k("ref"), 0, -1, "WITHSCORES");
      expect(after).toHaveLength(before.length - 2);
      expect(after.slice(0, 4)).toEqual(before.slice(0, 4)); // the two oldest remain
      await s.refund(k("ref")); await s.refund(k("ref")); await s.refund(k("ref")); // past empty: no error
      expect(await admin.exists(k("ref"))).toBe(0);
      await s.hit(k("ref"), 60, 5); await s.reset(k("ref")); expect(await admin.exists(k("ref"))).toBe(0);
    });
    it("flags set, expire and are visible from another connection", async () => {
      await new RedisStore(instA).setFlag(k("flag"), 1);
      expect(await new RedisStore(instB).hasFlag(k("flag"))).toBe(true);
      await sleep(1_150);
      expect(await new RedisStore(instB).hasFlag(k("flag"))).toBe(false);
    });
  });

  describe("RateLimiter on real Redis", () => {
    const limiterOn = (r: Redis, policy = DEFAULT_POLICY) => new RateLimiter({ store: new RedisStore(r), policy, secret });
    it("login: 100 parallel guesses from two 'instances' admit exactly accountIp.max", async () => {
      const A = limiterOn(instA); const B = limiterOn(instB);
      const out = await Promise.allSettled(Array.from({ length: 100 }, (_, i) => (i % 2 ? A : B).beginLogin(ip("198.51.100.20"), "par@example.test")));
      expect(out.filter((o) => o.status === "fulfilled")).toHaveLength(DEFAULT_POLICY.login.accountIp.max);
      for (const o of out) if (o.status === "rejected") expect(o.reason).toBeInstanceOf(RateLimitedException);
    });
    it("login: success clears the pair counter; the owner's recognised address survives an attacker's account-wide flood", async () => {
      const L = limiterOn(instA);
      const owner = ip("198.51.100.30");
      await (await L.beginLogin(owner, "own@example.test")).succeeded();
      for (let i = 0; i < DEFAULT_POLICY.login.accountUnrecognizedIp.max; i++) await L.beginLogin(ip(`192.0.2.${i + 1}`), "own@example.test");
      await expect(L.beginLogin(ip("192.0.2.250"), "own@example.test")).rejects.toBeInstanceOf(RateLimitedException);
      await expect(limiterOn(instB).beginLogin(owner, "own@example.test")).resolves.toBeDefined(); // another instance sees the known flag
    });
    it("a configured short window resets in real time and Retry-After reflects the remaining TTL", async () => {
      const policy = (() => { const r = parsePolicy(JSON.stringify({ signup: { ip: { max: 2, windowSeconds: 2 } } })); if (!r.ok) throw new Error(r.error); return r.policy; })();
      const L = limiterOn(instA, policy);
      await L.enforceIp("signup", ip("203.0.113.40")); await L.enforceIp("signup", ip("203.0.113.40"));
      const e = await L.enforceIp("signup", ip("203.0.113.40")).then(() => null, (x) => x);
      expect(e).toBeInstanceOf(RateLimitedException);
      expect(e.retryAfterSeconds).toBeGreaterThanOrEqual(1); expect(e.retryAfterSeconds).toBeLessThanOrEqual(2);
      await sleep(2_150);
      await expect(L.enforceIp("signup", ip("203.0.113.40"))).resolves.toBeUndefined();
    });
    it("stored keys contain no e-mail address", async () => {
      await limiterOn(instA).beginLogin(ip("198.51.100.50"), "private.person@example.test");
      const keys = await admin.keys("rl:v1:*");
      expect(keys.length).toBeGreaterThan(0);
      expect(keys.join("\n")).not.toMatch(/private|person|example\.test/i);
    });
  });

  describe("AI workspace limit and shared-address login on real Redis", () => {
    const limiterOn = (r: Redis) => new RateLimiter({ store: new RedisStore(r), policy: DEFAULT_POLICY, secret });
    it("AI: 100 parallel executions across two 'instances' admit exactly the workspace limit", async () => {
      const A = limiterOn(instA); const B = limiterOn(instB);
      const out = await Promise.all(Array.from({ length: 100 }, (_, i) => (i % 2 ? A : B).checkWorkspaceAi("ws_itest")));
      expect(out.filter((r) => r.allowed)).toHaveLength(DEFAULT_POLICY.aiExecution.workspace.max);
    });
    it("login: successes refund the per-IP flood counter on real Redis (hundreds of people behind one address are not throttled)", async () => {
      const L = limiterOn(instA); const shared = ip("100.64.9.9");
      for (let i = 0; i < DEFAULT_POLICY.login.ip.max * 3; i++) {
        await L.enforceIp("login", shared);
        await (await L.beginLogin(shared, `p${i}@example.test`)).succeeded();
      }
      expect(await admin.zcard("rl:v1:login:ip:100.64.9.9")).toBe(0);
    });
  });

  describe("Redis outage (connection to a closed port)", () => {
    const dead = () => { const r = new Redis("redis://127.0.0.1:1", { maxRetriesPerRequest: 1, connectTimeout: 300, commandTimeout: 300, retryStrategy: () => 100, lazyConnect: true }); r.on("error", () => undefined); return r; };
    it("memory mode: the limit is STILL enforced (never fails open) and the failure is reported once", async () => {
      const r = dead(); const events: string[] = [];
      const store = new ResilientStore({ primary: new RedisStore(r), fallback: new MemoryStore(), onFailure: "memory", onEvent: (e) => events.push(e.kind) });
      const L = new RateLimiter({ store, policy: DEFAULT_POLICY, secret });
      for (let i = 0; i < DEFAULT_POLICY.signup.ip.max; i++) await L.enforceIp("signup", ip("203.0.113.41"));
      await expect(L.enforceIp("signup", ip("203.0.113.41"))).rejects.toBeInstanceOf(RateLimitedException);
      expect(events).toEqual(["degraded"]);
      r.disconnect();
    });
    it("deny mode: refuses with 503 instead of admitting unchecked traffic", async () => {
      const r = dead();
      const store = new ResilientStore({ primary: new RedisStore(r), fallback: new MemoryStore(), onFailure: "deny" });
      const L = new RateLimiter({ store, policy: DEFAULT_POLICY, secret });
      await expect(L.enforceIp("signup", ip("203.0.113.42"))).rejects.toBeInstanceOf(ServiceUnavailableException);
      r.disconnect();
    });
    it("a correct login is never turned into an error by a failing bookkeeping write", async () => {
      const r = dead();
      const L = new RateLimiter({ store: new ResilientStore({ primary: new RedisStore(r), fallback: new MemoryStore(), onFailure: "memory" }), policy: DEFAULT_POLICY, secret });
      const attempt = await L.beginLogin(ip("198.51.100.60"), "x@example.test");
      await expect(attempt.succeeded()).resolves.toBeUndefined();
      r.disconnect();
    });
  });
});
