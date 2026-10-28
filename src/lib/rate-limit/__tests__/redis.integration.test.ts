/**
 * REAL-Redis integration test for the rate limiter store and limiter (Pre-5C release gate).
 *
 * Runs only when REDIS_INTEGRATION_URL points at a DISPOSABLE Redis (it writes and deletes keys under `rl:itest:*` and
 * `rl:v1:*` with a random per-run HMAC secret; never point it at production). Without that variable the whole file is skipped
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
    admin = new Redis(URL_!); instA = new Redis(URL_!); instB = new Redis(URL_!);
    await Promise.all([admin.ping(), instA.ping(), instB.ping()]);
  });
  afterAll(async () => {
    const keys = [...(await admin.keys(`rl:itest:${run}:*`)), ...(await admin.keys("rl:v1:*"))];
    if (keys.length) await admin.del(...keys);
    admin.disconnect(); instA.disconnect(); instB.disconnect();
  });

  describe("RedisStore.hit (Lua)", () => {
    it("creates the counter WITH its expiry in one step and never extends it", async () => {
      const s = new RedisStore(instA);
      const first = await s.hit(k("ttl"), 30);
      expect(first.count).toBe(1);
      const t1 = await admin.pttl(k("ttl"));
      expect(t1).toBeGreaterThan(0); expect(t1).toBeLessThanOrEqual(30_000);
      await sleep(300);
      const second = await s.hit(k("ttl"), 30);
      expect(second.count).toBe(2);
      const t2 = await admin.pttl(k("ttl"));
      expect(t2).toBeLessThan(t1); // the window kept running; hits did not reset it
      expect(second.ttlMs).toBeLessThanOrEqual(t1);
    });
    it("heals a counter stranded WITHOUT an expiry (the old INCR-then-EXPIRE failure mode)", async () => {
      await admin.set(k("stranded"), "41"); // no TTL: would block forever under a naive implementation
      expect(await admin.pttl(k("stranded"))).toBe(-1);
      const r = await new RedisStore(instA).hit(k("stranded"), 20);
      expect(r.count).toBe(42);
      expect(await admin.pttl(k("stranded"))).toBeGreaterThan(0);
    });
    it("is atomic under concurrency from two connections: 200 parallel hits yield exactly the counts 1..200, once each", async () => {
      const a = new RedisStore(instA); const b = new RedisStore(instB);
      const res = await Promise.all(Array.from({ length: 200 }, (_, i) => (i % 2 ? a : b).hit(k("conc"), 30)));
      expect(res.map((r) => r.count).sort((x, y) => x - y)).toEqual(Array.from({ length: 200 }, (_, i) => i + 1));
      expect(await admin.pttl(k("conc"))).toBeGreaterThan(0);
    });
    it("the window really ends and a fresh one starts (real TTL expiry)", async () => {
      const s = new RedisStore(instA);
      await s.hit(k("expire"), 1); await s.hit(k("expire"), 1);
      await sleep(1_150);
      expect((await s.hit(k("expire"), 1)).count).toBe(1);
    });
    it("decrFloor decrements, never below zero, and removes an emptied counter", async () => {
      const s = new RedisStore(instA);
      await s.hit(k("dec"), 60); await s.hit(k("dec"), 60); await s.hit(k("dec"), 60);
      await s.decrFloor(k("dec")); expect(await admin.get(k("dec"))).toBe("2");
      await s.decrFloor(k("dec")); await s.decrFloor(k("dec")); await s.decrFloor(k("dec"));
      expect(await admin.exists(k("dec"))).toBe(0);
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
