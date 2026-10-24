/**
 * MODULE 5B.5 regression (confirmed defect D4): the counter and its expiry must be created atomically.
 * DOUBLE: an in-memory fake of the ioredis calls used (multi/set/incr/ttl/exec, expire) with a controllable clock.
 * It models MULTI/EXEC as all-or-nothing. It proves the limiter's use of Redis, NOT real Redis behaviour.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const fake = vi.hoisted(() => {
  const state = { now: 0, store: new Map<string, { value: number; expiresAt: number | null }>(), failExec: false, execCalls: 0, expireCalls: 0 };
  const live = (k: string) => { const e = state.store.get(k); if (e && e.expiresAt !== null && e.expiresAt <= state.now) { state.store.delete(k); return undefined; } return e; };
  class FakeRedis {
    on() { return this; }
    multi() {
      const ops: Array<() => [Error | null, unknown]> = [];
      const chain = {
        set: (k: string, v: string, ex: string, secs: number, nx: string) => { ops.push(() => { if (nx === "NX" && live(k)) return [null, null]; state.store.set(k, { value: Number(v), expiresAt: ex === "EX" ? state.now + secs * 1000 : null }); return [null, "OK"]; }); return chain; },
        incr: (k: string) => { ops.push(() => { const e = live(k) ?? { value: 0, expiresAt: null }; e.value += 1; state.store.set(k, e); return [null, e.value]; }); return chain; },
        ttl: (k: string) => { ops.push(() => { const e = live(k); return [null, !e ? -2 : e.expiresAt === null ? -1 : Math.ceil((e.expiresAt - state.now) / 1000)]; }); return chain; },
        exec: async () => { state.execCalls++; if (state.failExec) throw new Error("connection dropped"); return ops.map((op) => op()); },
      };
      return chain;
    }
    async expire(k: string, secs: number) { state.expireCalls++; const e = live(k); if (e) e.expiresAt = state.now + secs * 1000; return e ? 1 : 0; }
  }
  return { state, FakeRedis };
});
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/env", () => ({ env: { REDIS_URL: "redis://fake" }, isRedisConfigured: true }));
vi.mock("ioredis", () => ({ default: fake.FakeRedis }));

import { checkAIExecutionRateLimit } from "@/modules/ai/core/rate-limit";

const KEY = (ws: string) => `ai:ratelimit:${ws}`;
beforeEach(() => { fake.state.now = 1_000_000; fake.state.store.clear(); fake.state.failExec = false; fake.state.execCalls = 0; fake.state.expireCalls = 0; });

describe("fixed-window limiter (atomic)", () => {
  it("the first request creates the counter WITH its expiry in the same transaction (no separate EXPIRE needed)", async () => {
    const r = await checkAIExecutionRateLimit("ws_1");
    expect(r).toMatchObject({ allowed: true, configured: true, remaining: 19, limit: 20 });
    expect(fake.state.store.get(KEY("ws_1"))).toEqual({ value: 1, expiresAt: 1_000_000 + 60_000 });
    expect(fake.state.expireCalls).toBe(0);
    expect(fake.state.execCalls).toBe(1);
  });
  it("allows exactly the limit inside a window, then denies", async () => {
    const results: boolean[] = [];
    for (let i = 0; i < 25; i++) results.push((await checkAIExecutionRateLimit("ws_1")).allowed);
    expect(results.filter(Boolean)).toHaveLength(20);
    expect(results.slice(20).every((a) => a === false)).toBe(true);
  });
  it("the window expires and the workspace is allowed again", async () => {
    for (let i = 0; i < 25; i++) await checkAIExecutionRateLimit("ws_1");
    fake.state.now += 61_000;
    expect(await checkAIExecutionRateLimit("ws_1")).toMatchObject({ allowed: true, remaining: 19 });
  });
  it("the expiry is never extended by later requests (fixed window)", async () => {
    await checkAIExecutionRateLimit("ws_1");
    fake.state.now += 30_000;
    await checkAIExecutionRateLimit("ws_1");
    expect(fake.state.store.get(KEY("ws_1"))!.expiresAt).toBe(1_000_000 + 60_000);
  });
  it("workspaces are counted independently", async () => {
    for (let i = 0; i < 25; i++) await checkAIExecutionRateLimit("ws_A");
    expect((await checkAIExecutionRateLimit("ws_A")).allowed).toBe(false);
    expect((await checkAIExecutionRateLimit("ws_B")).allowed).toBe(true);
    expect(fake.state.store.has(KEY("ws_B"))).toBe(true);
  });
  it("a failed transaction applies NOTHING (no stranded counter) and fails open", async () => {
    fake.state.failExec = true;
    expect(await checkAIExecutionRateLimit("ws_1")).toEqual({ allowed: true, configured: false });
    expect(fake.state.store.has(KEY("ws_1"))).toBe(false);
    fake.state.failExec = false;
    expect(await checkAIExecutionRateLimit("ws_1")).toMatchObject({ allowed: true, configured: true, remaining: 19 });
  });
  it("a counter stranded WITHOUT an expiry (left by the old INCR-then-EXPIRE code) is healed on the next request", async () => {
    fake.state.store.set(KEY("ws_1"), { value: 500, expiresAt: null });
    const first = await checkAIExecutionRateLimit("ws_1");
    expect(first.allowed).toBe(false);                       // still over the limit for this window...
    expect(fake.state.expireCalls).toBe(1);                  // ...but the expiry has been restored
    expect(fake.state.store.get(KEY("ws_1"))!.expiresAt).toBe(1_000_000 + 60_000);
    fake.state.now += 61_000;                                // ...so it clears itself
    expect((await checkAIExecutionRateLimit("ws_1")).allowed).toBe(true);
  });
  it("a custom per-call limit is honoured", async () => {
    expect((await checkAIExecutionRateLimit("ws_1", 1)).allowed).toBe(true);
    expect((await checkAIExecutionRateLimit("ws_1", 1)).allowed).toBe(false);
  });
});
