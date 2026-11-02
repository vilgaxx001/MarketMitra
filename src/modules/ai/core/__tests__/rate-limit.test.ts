/**
 * AI execution rate limit (cost control) - unit tests of the fail-safe policy. Finding closed here: the limiter used to FAIL OPEN
 * (return "allowed") when REDIS_URL was unset or Redis errored, which meant unlimited paid provider calls.
 *
 * DOUBLES: env (a mutable object), logger, and ioredis (a client whose Lua eval fails, i.e. "Redis is down"). The limiter and
 * the in-process store are REAL. Real-Redis behaviour is covered by rate-limit.redis.integration.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const h = vi.hoisted(() => ({
  env: {} as Record<string, unknown>,
  log: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
  redisEvalCalls: 0,
}));
vi.mock("@/lib/logger", () => ({ logger: h.log }));
vi.mock("@/lib/env", () => ({ env: h.env, isProduction: false }));
vi.mock("ioredis", () => ({
  default: class FakeRedis {
    on() { return this; }
    async eval() { h.redisEvalCalls++; throw new Error("connect ECONNREFUSED 127.0.0.1:6379"); }
    async del() { throw new Error("down"); }
    async set() { throw new Error("down"); }
    async exists() { throw new Error("down"); }
  },
}));

const baseEnv = { SESSION_SECRET: "unit-test-secret-unit-test-secret-1234", TRUSTED_PROXY_HOPS: 0, RATE_LIMIT_ON_STORE_FAILURE: "memory" };
async function load(over: Record<string, unknown> = {}) {
  vi.resetModules();
  for (const k of Object.keys(h.env)) delete h.env[k];
  Object.assign(h.env, baseEnv, over);
  return (await import("@/modules/ai/core/rate-limit")).checkAIExecutionRateLimit;
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(1_800_000_000_000); h.redisEvalCalls = 0; Object.values(h.log).forEach((f) => f.mockClear()); });
afterEach(() => { vi.useRealTimers(); vi.doUnmock("@/lib/rate-limit"); });

describe("no Redis configured: enforced in process, never unlimited", () => {
  it("allows exactly the default limit (20 / 60 s) per workspace, then refuses with a Retry-After", async () => {
    const check = await load();
    const results = []; for (let i = 0; i < 25; i++) results.push(await check("ws_1"));
    expect(results.filter((r) => r.allowed)).toHaveLength(20);
    const refused = results[24]!;
    expect(refused).toMatchObject({ allowed: false, limit: 20, remaining: 0 });
    expect(refused.retryAfterSeconds).toBeGreaterThan(0); expect(refused.retryAfterSeconds).toBeLessThanOrEqual(60);
    expect(refused.unavailable).toBeUndefined();
  });
  it("says once that limits are per instance", async () => {
    const check = await load();
    for (let i = 0; i < 5; i++) await check("ws_1");
    expect(h.log.warn.mock.calls.filter((c) => c[0]?.msg === "rate_limit_store_not_configured")).toHaveLength(1);
  });
  it("workspaces are independent; a per-call maximum is honoured", async () => {
    const check = await load();
    for (let i = 0; i < 25; i++) await check("ws_A");
    expect((await check("ws_A")).allowed).toBe(false);
    expect((await check("ws_B")).allowed).toBe(true);
    expect((await check("ws_C", 1)).allowed).toBe(true);
    expect((await check("ws_C", 1)).allowed).toBe(false);
  });
  it("the limit is configurable through RATE_LIMIT_POLICY_JSON", async () => {
    const check = await load({ RATE_LIMIT_POLICY_JSON: JSON.stringify({ aiExecution: { workspace: { max: 2, windowSeconds: 30 } } }) });
    expect([(await check("ws_1")).allowed, (await check("ws_1")).allowed, (await check("ws_1")).allowed]).toEqual([true, true, false]);
  });
  it("a window that has passed frees the workspace again, and refused calls did not extend the block", async () => {
    const check = await load();
    for (let i = 0; i < 20; i++) await check("ws_1");
    for (let i = 0; i < 30; i++) { vi.advanceTimersByTime(1_000); await check("ws_1"); } // hammering while blocked
    vi.advanceTimersByTime(31_000); // 61 s after the admitted burst
    expect(await check("ws_1")).toMatchObject({ allowed: true });
  });
  it("REGRESSION (2x burst): never more than the limit in any 60 s, even straddling what used to be a window boundary", async () => {
    const check = await load();
    await check("ws_1"); // t0
    vi.advanceTimersByTime(59_999);
    let a = 0; for (let i = 0; i < 40; i++) if ((await check("ws_1")).allowed) a++;
    vi.advanceTimersByTime(2);
    let b = 0; for (let i = 0; i < 40; i++) if ((await check("ws_1")).allowed) b++;
    expect(1 + a + b).toBe(21); // 20 inside the first 60 s, plus the one slot freed when t0 left the window; the old code admitted 40
  });
});

describe("Redis configured but unreachable (explicit fail-safe policy)", () => {
  it("memory mode (default): STILL enforces the limit in process and reports the degradation once", async () => {
    const check = await load({ REDIS_URL: "redis://redis.invalid:6379" });
    const results = []; for (let i = 0; i < 25; i++) results.push((await check("ws_1")).allowed);
    expect(results.filter(Boolean)).toHaveLength(20); // not 25: this is the finding
    const degraded = h.log.error.mock.calls.filter((c) => c[0]?.msg === "rate_limit_store_degraded");
    expect(degraded).toHaveLength(1);
    expect(h.redisEvalCalls).toBe(1); // circuit breaker: later calls do not each wait for a dead Redis
    expect(JSON.stringify(h.log.error.mock.calls)).not.toContain("ws_1");
  });
  it("deny mode: refuses with unavailable=true and a Retry-After; nothing is admitted", async () => {
    const check = await load({ REDIS_URL: "redis://redis.invalid:6379", RATE_LIMIT_ON_STORE_FAILURE: "deny" });
    for (let i = 0; i < 3; i++) {
      const r = await check("ws_1");
      expect(r).toMatchObject({ allowed: false, unavailable: true });
      expect(r.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("unexpected failures fail CLOSED", () => {
  it("an error thrown by the limiter itself refuses the request and logs the error NAME only", async () => {
    vi.resetModules();
    vi.doMock("@/lib/rate-limit", () => ({ checkWorkspaceAiLimit: () => { throw new TypeError("secret detail that must not be logged"); } }));
    const { checkAIExecutionRateLimit } = await import("@/modules/ai/core/rate-limit");
    expect(await checkAIExecutionRateLimit("ws_1")).toMatchObject({ allowed: false, unavailable: true });
    const logged = JSON.stringify(h.log.error.mock.calls);
    expect(logged).toContain("ai_rate_limit_check_failed_closed"); expect(logged).toContain("TypeError");
    expect(logged).not.toContain("secret detail");
  });
});
