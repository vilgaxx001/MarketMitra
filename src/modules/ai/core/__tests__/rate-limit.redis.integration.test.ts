/**
 * REAL-Redis integration test for the AI rate limiter (Pre-5C release gate).
 *
 * Runs only when REDIS_INTEGRATION_URL points at a DISPOSABLE Redis (it writes and deletes keys under
 * `ai:ratelimit:itest-*`; never point it at production). Without that variable the whole file is skipped and is
 * reported as skipped, not as passed.
 *
 *   redis-server --port 63799 --save "" --appendonly no --daemonize yes
 *   REDIS_INTEGRATION_URL=redis://127.0.0.1:63799 npx vitest run src/modules/ai/core/__tests__/rate-limit.redis.integration.test.ts
 *
 * Uses the REAL ioredis client and the REAL checkAIExecutionRateLimit. Logger and env are test doubles (env only supplies the URL).
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import Redis from "ioredis";

const URL_ = process.env.REDIS_INTEGRATION_URL;
const warn = vi.hoisted(() => vi.fn());
vi.mock("@/lib/logger", () => ({ logger: { warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/env", () => ({ env: { REDIS_URL: process.env.REDIS_INTEGRATION_URL ?? "redis://127.0.0.1:1" }, isRedisConfigured: true }));

const d = URL_ ? describe : describe.skip;
const key = (ws: string) => `ai:ratelimit:${ws}`;

d("rate limiter against a real Redis", () => {
  let admin: Redis;
  let check: (ws: string, max?: number) => Promise<{ allowed: boolean; configured: boolean; remaining?: number; limit?: number }>;
  beforeAll(async () => {
    admin = new Redis(URL_!);
    await admin.ping();
    ({ checkAIExecutionRateLimit: check } = await import("@/modules/ai/core/rate-limit"));
  });
  afterAll(async () => {
    const keys = await admin.keys("ai:ratelimit:itest-*");
    if (keys.length) await admin.del(...keys);
    admin.disconnect();
  });
  beforeEach(async () => {
    warn.mockClear();
    const keys = await admin.keys("ai:ratelimit:itest-*");
    if (keys.length) await admin.del(...keys);
  });

  it("creates the counter with its expiry in one transaction (TTL is set after the very first call)", async () => {
    const r = await check("itest-a");
    expect(r).toMatchObject({ allowed: true, configured: true, remaining: 19, limit: 20 });
    const ttl = await admin.ttl(key("itest-a"));
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60);
    expect(await admin.get(key("itest-a"))).toBe("1");
  });

  it("denies the request after the limit and keeps the original window (TTL does not reset)", async () => {
    for (let i = 0; i < 3; i++) await check("itest-b", 3);
    const denied = await check("itest-b", 3);
    expect(denied).toMatchObject({ allowed: false, configured: true, remaining: 0 });
    expect(await admin.ttl(key("itest-b"))).toBeLessThanOrEqual(60);
    expect(await admin.get(key("itest-b"))).toBe("4");
  });

  it("is atomic under concurrency: 60 parallel calls with limit 20 allow exactly 20", async () => {
    const results = await Promise.all(Array.from({ length: 60 }, () => check("itest-c", 20)));
    expect(results.filter((r) => r.allowed).length).toBe(20);
    expect(await admin.get(key("itest-c"))).toBe("60");
    expect(await admin.ttl(key("itest-c"))).toBeGreaterThan(0);
  });

  it("recovers a key stranded WITHOUT an expiry (as the old INCR-then-EXPIRE code could leave): the TTL is restored", async () => {
    await admin.set(key("itest-d"), "25"); // over the limit, no TTL: the old code would have denied this workspace forever
    expect(await admin.ttl(key("itest-d"))).toBe(-1);
    const r = await check("itest-d", 20);
    expect(r.allowed).toBe(false); // still over the limit for THIS window...
    const ttl = await admin.ttl(key("itest-d"));
    expect(ttl).toBeGreaterThan(0); // ...but the window is now bounded, so it will end
    expect(ttl).toBeLessThanOrEqual(60);
  });

  it("starts a fresh window after the key expires", async () => {
    await check("itest-e", 5); await check("itest-e", 5);
    await admin.pexpire(key("itest-e"), 40);
    await new Promise((r) => setTimeout(r, 120));
    expect(await admin.exists(key("itest-e"))).toBe(0);
    const r = await check("itest-e", 5);
    expect(r).toMatchObject({ allowed: true, remaining: 4 });
  });

  it("workspaces are independent", async () => {
    for (let i = 0; i < 4; i++) await check("itest-f1", 3);
    expect((await check("itest-f1", 3)).allowed).toBe(false);
    expect((await check("itest-f2", 3)).allowed).toBe(true);
  });

  it("a command error inside the transaction (key holds the wrong type) FAILS OPEN, logs a warning, and does not corrupt the key", async () => {
    await admin.hset(key("itest-g"), "field", "value");
    const r = await check("itest-g");
    expect(r).toEqual({ allowed: true, configured: false });
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ msg: "ai_rate_limit_check_failed_open", workspaceId: "itest-g" }));
    expect(await admin.type(key("itest-g"))).toBe("hash");
  });
});

describe("rate limiter with Redis unreachable (real ioredis, nothing listening)", () => {
  it.runIf(Boolean(URL_))("fails open within a bounded time and logs a warning", async () => {
    vi.resetModules();
    vi.doMock("@/lib/env", () => ({ env: { REDIS_URL: "redis://127.0.0.1:1" }, isRedisConfigured: true })); // port 1: connection refused
    const { checkAIExecutionRateLimit } = await import("@/modules/ai/core/rate-limit");
    const started = Date.now();
    const r = await checkAIExecutionRateLimit("itest-down");
    expect(r).toEqual({ allowed: true, configured: false });
    expect(Date.now() - started).toBeLessThan(10_000);
    expect(warn).toHaveBeenCalled();
    vi.doUnmock("@/lib/env");
  }, 15_000);
});
