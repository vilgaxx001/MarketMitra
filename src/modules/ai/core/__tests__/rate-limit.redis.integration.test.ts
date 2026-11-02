/**
 * REAL-Redis integration test for the AI rate limiter (Pre-5C release gate).
 *
 * Runs only when REDIS_INTEGRATION_URL points at a DISPOSABLE Redis (it uses logical database 6 and FLUSHES it at the end;
 * never point it at production). Without that variable the whole file is skipped and is reported as skipped, not as passed.
 *
 *   redis-server --port 63799 --save "" --appendonly no --daemonize yes
 *   REDIS_INTEGRATION_URL=redis://127.0.0.1:63799 npx vitest run src/modules/ai/core/__tests__/rate-limit.redis.integration.test.ts
 *
 * Uses the REAL ioredis client, the REAL Lua script and the REAL checkAIExecutionRateLimit. Logger and env are test doubles
 * (env supplies only what the limiter reads).
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import Redis from "ioredis";

const URL_ = process.env.REDIS_INTEGRATION_URL;
const DB = 6; // private to this file: other integration files run in parallel against the same server
const dbUrl = (u: string) => `${u.replace(/\/\d*$/, "")}/${DB}`;
const h = vi.hoisted(() => ({ env: {} as Record<string, unknown>, log: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/logger", () => ({ logger: h.log }));
vi.mock("@/lib/env", () => ({ env: h.env, isProduction: false }));

const d = URL_ ? describe : describe.skip;
const key = (ws: string) => `rl:v1:ai:ws:${ws}`;
const baseEnv = () => ({ SESSION_SECRET: "itest-secret-itest-secret-itest-secret-1", TRUSTED_PROXY_HOPS: 0, RATE_LIMIT_ON_STORE_FAILURE: "memory", REDIS_URL: dbUrl(URL_ ?? "redis://127.0.0.1:1") });

type Check = (ws: string, max?: number) => Promise<{ allowed: boolean; unavailable?: boolean; remaining?: number; limit?: number; retryAfterSeconds?: number }>;
async function loadCheck(over: Record<string, unknown> = {}): Promise<Check> {
  vi.resetModules();
  for (const k of Object.keys(h.env)) delete h.env[k];
  Object.assign(h.env, baseEnv(), over);
  return (await import("@/modules/ai/core/rate-limit")).checkAIExecutionRateLimit;
}

d("AI rate limiter against a real Redis", () => {
  let admin: Redis;
  let check: Check;
  beforeAll(async () => {
    admin = new Redis(URL_!, { db: DB });
    await admin.ping();
  });
  afterAll(async () => {
    await admin.flushdb();
    admin.disconnect();
  });
  beforeEach(async () => {
    Object.values(h.log).forEach((f) => f.mockClear());
    await admin.flushdb();
    check = await loadCheck();
  });

  it("admits up to the limit, records one entry per admission with an expiry of at most one window", async () => {
    const r = await check("itest-a");
    expect(r).toMatchObject({ allowed: true, remaining: 19, limit: 20 });
    expect(await admin.zcard(key("itest-a"))).toBe(1);
    const ttl = await admin.ttl(key("itest-a"));
    expect(ttl).toBeGreaterThan(0); expect(ttl).toBeLessThanOrEqual(60);
  });

  it("refuses after the limit WITHOUT recording the refused calls or restarting the clock", async () => {
    for (let i = 0; i < 3; i++) await check("itest-b", 3);
    const pttl = await admin.pttl(key("itest-b"));
    const denied = await check("itest-b", 3);
    expect(denied).toMatchObject({ allowed: false, remaining: 0 });
    expect(denied.retryAfterSeconds).toBeGreaterThan(0); expect(denied.retryAfterSeconds).toBeLessThanOrEqual(60);
    expect(await admin.zcard(key("itest-b"))).toBe(3);
    expect(await admin.pttl(key("itest-b"))).toBeLessThanOrEqual(pttl);
  });

  it("is atomic under concurrency: 60 parallel calls with limit 20 admit exactly 20", async () => {
    const results = await Promise.all(Array.from({ length: 60 }, () => check("itest-c", 20)));
    expect(results.filter((r) => r.allowed)).toHaveLength(20);
    expect(await admin.zcard(key("itest-c"))).toBe(20);
  });

  it("is shared across app instances: two independently loaded limiters see one counter", async () => {
    const other = await loadCheck(); // a second module instance with its own connection
    const results = await Promise.all(Array.from({ length: 40 }, (_, i) => (i % 2 ? check : other)("itest-share", 20)));
    expect(results.filter((r) => r.allowed)).toHaveLength(20);
  });

  it("the window slides: a slot frees exactly when the oldest admission leaves it", async () => {
    await check("itest-e", 2); await check("itest-e", 2);
    const refused = await check("itest-e", 2);
    expect(refused.allowed).toBe(false);
    await admin.zadd(key("itest-e"), Date.now() - 61_000, "backdated"); // an entry already outside the window
    await admin.zremrangebyrank(key("itest-e"), 1, -1); // keep only the backdated one
    expect((await check("itest-e", 2)).allowed).toBe(true);
  });

  it("workspaces are independent", async () => {
    for (let i = 0; i < 4; i++) await check("itest-f1", 3);
    expect((await check("itest-f1", 3)).allowed).toBe(false);
    expect((await check("itest-f2", 3)).allowed).toBe(true);
  });

  it("a command error (key holds the wrong type) is NOT fail-open: the limit is enforced in process, the degradation is logged, the key is untouched", async () => {
    await admin.hset(key("itest-g"), "field", "value");
    const results: boolean[] = [];
    for (let i = 0; i < 25; i++) results.push((await check("itest-g")).allowed);
    expect(results.filter(Boolean)).toHaveLength(20);
    expect(h.log.error).toHaveBeenCalledWith(expect.objectContaining({ msg: "rate_limit_store_degraded" }));
    expect(await admin.type(key("itest-g"))).toBe("hash");
  });
});

describe("AI rate limiter with Redis unreachable (real ioredis, nothing listening)", () => {
  it.runIf(Boolean(URL_))("memory mode enforces the limit within a bounded time and logs the outage", async () => {
    const down = await loadCheck({ REDIS_URL: "redis://127.0.0.1:1" }); // port 1: connection refused
    const started = Date.now();
    const results: boolean[] = [];
    for (let i = 0; i < 25; i++) results.push((await down("itest-down")).allowed);
    expect(results.filter(Boolean)).toHaveLength(20); // old behaviour: all 25 allowed
    expect(Date.now() - started).toBeLessThan(10_000);
    expect(h.log.error).toHaveBeenCalledWith(expect.objectContaining({ msg: "rate_limit_store_degraded" }));
  }, 15_000);

  it.runIf(Boolean(URL_))("deny mode refuses (unavailable) instead of admitting", async () => {
    const down = await loadCheck({ REDIS_URL: "redis://127.0.0.1:1", RATE_LIMIT_ON_STORE_FAILURE: "deny" });
    expect(await down("itest-down2")).toMatchObject({ allowed: false, unavailable: true });
  }, 15_000);
});
