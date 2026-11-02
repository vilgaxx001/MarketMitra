import { describe, it, expect, vi } from "vitest";
import { MemoryStore, RedisStore, ResilientStore, type CounterStore, type RedisLike } from "@/lib/rate-limit/store";
import { ServiceUnavailableException } from "@/lib/api-response";

const clock = () => { let t = 5_000_000; return { now: () => t, advance: (ms: number) => { t += ms; }, set: (v: number) => { t = v; } }; };

describe("MemoryStore: exact sliding window", () => {
  it("admits `max` requests, refuses the next, and frees a slot exactly when the oldest one leaves the window", async () => {
    const c = clock(); const s = new MemoryStore(c.now);
    expect(await s.hit("k", 10, 2)).toEqual({ allowed: true, count: 1, retryAfterMs: 0 });
    c.advance(4_000);
    expect(await s.hit("k", 10, 2)).toEqual({ allowed: true, count: 2, retryAfterMs: 0 });
    c.advance(1_000);
    expect(await s.hit("k", 10, 2)).toEqual({ allowed: false, count: 2, retryAfterMs: 5_000 }); // oldest (t=0) leaves at t=10s; now t=5s
    c.advance(4_999);
    expect((await s.hit("k", 10, 2)).allowed).toBe(false);
    c.advance(1);
    expect((await s.hit("k", 10, 2)).allowed).toBe(true); // exactly at oldest + window
  });

  it("REGRESSION (fixed-window 2x burst): at most `max` are admitted in ANY window-length interval, including across what used to be a boundary", async () => {
    const MAX = 20;
    const c = clock(); const s = new MemoryStore(c.now);
    await s.hit("k", 60, MAX); // a window opened at t0 (old design: counter created here)
    c.advance(59_999); // last millisecond of the old fixed window
    let first = 0; for (let i = 0; i < 40; i++) if ((await s.hit("k", 60, MAX)).allowed) first++;
    c.advance(2); // first millisecond of what used to be the NEXT window (old design admitted another 20 here)
    let second = 0; for (let i = 0; i < 40; i++) if ((await s.hit("k", 60, MAX)).allowed) second++;
    // 19 more fit before the first entry leaves the window; 2 ms later exactly the one freed slot opens. The old fixed window admitted 40 within 2 ms.
    expect(first).toBe(MAX - 1);
    expect(second).toBe(1);
  });

  it("property: over adversarial schedules the admitted count in every sliding window never exceeds max", async () => {
    // Deterministic pseudo-random schedule (LCG) so a failure is reproducible.
    let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (const [window, max] of [[10, 3], [60, 20], [900, 5]] as const) {
      const c = clock(); const s = new MemoryStore(c.now); const admitted: number[] = [];
      for (let i = 0; i < 3_000; i++) {
        // bursts of 0-ms gaps mixed with idle gaps that land near the window length: the worst case for window-boundary designs
        c.advance(rnd() < 0.7 ? 0 : Math.floor(rnd() * window * 1_300));
        if ((await s.hit("k", window, max)).allowed) admitted.push(c.now());
      }
      const W = window * 1_000;
      for (let i = 0; i < admitted.length; i++) {
        const inWindow = admitted.filter((t) => t > admitted[i]! - W && t <= admitted[i]!).length;
        expect(inWindow).toBeLessThanOrEqual(max);
      }
      expect(admitted.length).toBeGreaterThan(max); // the schedule did exercise refill, not just the first window
    }
  });

  it("refused requests are NOT recorded: hammering during a block does not lengthen it", async () => {
    const c = clock(); const s = new MemoryStore(c.now);
    await s.hit("k", 60, 1);
    for (let i = 0; i < 500; i++) { c.advance(10); expect((await s.hit("k", 60, 1)).allowed).toBe(false); }
    c.set(5_000_000 + 60_000); // 60 s after the single admitted request
    expect((await s.hit("k", 60, 1)).allowed).toBe(true);
  });

  it("refund undoes the most recent admission and never goes below empty; reset forgets the key", async () => {
    const s = new MemoryStore(); await s.hit("k", 60, 5); await s.hit("k", 60, 5);
    await s.refund("k"); expect((await s.hit("k", 60, 5)).count).toBe(2);
    await s.refund("k"); await s.refund("k"); await s.refund("k");
    expect(s.size).toBe(0); await s.refund("missing"); expect(s.size).toBe(0);
    await s.hit("k", 60, 5); await s.reset("k"); expect(s.size).toBe(0);
  });

  it("flags expire", async () => {
    const c = clock(); const s = new MemoryStore(c.now);
    await s.setFlag("f", 5); expect(await s.hasFlag("f")).toBe(true);
    c.advance(5_001); expect(await s.hasFlag("f")).toBe(false);
  });

  it("is bounded: a flood of distinct keys cannot grow it past maxKeys", async () => {
    const s = new MemoryStore(Date.now, 100);
    for (let i = 0; i < 1_000; i++) await s.hit(`k${i}`, 3600, 5);
    expect(s.size).toBeLessThanOrEqual(100);
    expect((await s.hit("k999", 3600, 5)).count).toBe(2); // newest keys survive eviction
  });

  it("purges expired keys before evicting live ones", async () => {
    const c = clock(); const s = new MemoryStore(c.now, 10);
    for (let i = 0; i < 10; i++) await s.hit(`old${i}`, 1, 5);
    await s.hit("live", 3600, 5);
    c.advance(2_000);
    for (let i = 0; i < 9; i++) await s.hit(`new${i}`, 3600, 5);
    expect((await s.hit("live", 3600, 5)).count).toBe(2);
  });
});

describe("RedisStore result validation", () => {
  const fake = (res: unknown): RedisLike => ({ eval: async () => res, del: async () => 1, set: async () => "OK", exists: async () => 1 });
  it("maps the script reply", async () => {
    expect(await new RedisStore(fake([1, 3, 0])).hit("k", 10, 5)).toEqual({ allowed: true, count: 3, retryAfterMs: 0 });
    expect(await new RedisStore(fake([0, 5, 4500])).hit("k", 10, 5)).toEqual({ allowed: false, count: 5, retryAfterMs: 4500 });
  });
  it.each([[null], [[1]], [[1, 2]], [["x", 1, 2]], ["nope"]])("rejects a malformed reply %j instead of guessing", async (bad) => {
    await expect(new RedisStore(fake(bad)).hit("k", 10, 5)).rejects.toThrow();
  });
  it("sends window, max and a unique member to the script, one key", async () => {
    const calls: unknown[][] = [];
    const redis: RedisLike = { eval: async (...a) => { calls.push(a); return [1, 1, 0]; }, del: async () => 1, set: async () => "OK", exists: async () => 0 };
    const s = new RedisStore(redis); await s.hit("the-key", 90, 7); await s.hit("the-key", 90, 7);
    const [, n1, key1, win1, max1, member1] = calls[0] as [string, number, string, number, number, string];
    const member2 = (calls[1] as unknown[])[5];
    expect([n1, key1, win1, max1]).toEqual([1, "the-key", 90_000, 7]);
    expect(member1).toMatch(/^[0-9a-f-]{36}$/); expect(member2).not.toBe(member1);
  });
});

function failing(): CounterStore {
  const boom = async () => { throw new Error("connect ECONNREFUSED"); };
  return { hit: boom, refund: boom, reset: boom, setFlag: boom, hasFlag: boom };
}

describe("ResilientStore: Redis outage never disables protection", () => {
  it("memory mode: keeps ENFORCING the same limits in-process and reports the outage once", async () => {
    const events: string[] = []; const c = clock();
    const s = new ResilientStore({ primary: failing(), fallback: new MemoryStore(c.now), onFailure: "memory", now: c.now, onEvent: (e) => events.push(e.kind) });
    const admitted: boolean[] = [];
    for (let i = 0; i < 4; i++) admitted.push((await s.hit("k", 60, 3)).allowed);
    expect(admitted).toEqual([true, true, true, false]); // still limiting, not "allowed because Redis is down"
    expect(events).toEqual(["degraded"]); // one event, not one per request
  });
  it("circuit breaker: after a failure Redis is not retried until the breaker interval has passed", async () => {
    const c = clock(); const primary = failing(); const spy = vi.spyOn(primary, "hit");
    const s = new ResilientStore({ primary, fallback: new MemoryStore(c.now), onFailure: "memory", now: c.now, breakerMs: 5_000 });
    await s.hit("k", 60, 5); await s.hit("k", 60, 5); await s.hit("k", 60, 5);
    expect(spy).toHaveBeenCalledTimes(1);
    c.advance(5_001); await s.hit("k", 60, 5);
    expect(spy).toHaveBeenCalledTimes(2);
  });
  it("recovers: when Redis answers again it is used again and the recovery is reported", async () => {
    const c = clock(); const events: string[] = [];
    let healthy = false; const real = new MemoryStore(c.now);
    const flaky: CounterStore = {
      hit: (k, w, m) => (healthy ? real.hit(k, w, m) : Promise.reject(new Error("down"))),
      refund: (k) => real.refund(k), reset: (k) => real.reset(k), setFlag: (k, t) => real.setFlag(k, t), hasFlag: (k) => real.hasFlag(k),
    };
    const s = new ResilientStore({ primary: flaky, fallback: new MemoryStore(c.now), onFailure: "memory", now: c.now, breakerMs: 1_000, onEvent: (e) => events.push(e.kind) });
    await s.hit("k", 60, 5); healthy = true; c.advance(1_001);
    expect((await s.hit("k", 60, 5)).count).toBe(1); // served by the primary again
    expect(events).toEqual(["degraded", "recovered"]);
  });
  it("deny mode: fails CLOSED with a 503 and a Retry-After, never 'allowed'", async () => {
    const c = clock();
    const s = new ResilientStore({ primary: failing(), fallback: new MemoryStore(c.now), onFailure: "deny", now: c.now, breakerMs: 5_000 });
    const first = await s.hit("k", 60, 5).catch((e) => e);
    expect(first).toBeInstanceOf(ServiceUnavailableException);
    c.advance(1_000);
    const again = await s.hit("k", 60, 5).catch((e) => e); // breaker open: still refused, without calling Redis
    expect(again).toBeInstanceOf(ServiceUnavailableException);
    expect(again.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(again.retryAfterSeconds).toBeLessThanOrEqual(5);
  });
  it("no primary configured: uses the in-process store and says so once", async () => {
    const events: string[] = [];
    const s = new ResilientStore({ primary: null, fallback: new MemoryStore(), onFailure: "memory", onEvent: (e) => events.push(e.kind) });
    expect((await s.hit("k", 60, 5)).count).toBe(1); expect((await s.hit("k", 60, 5)).count).toBe(2);
    expect(events).toEqual(["not-configured"]);
  });
  it("events never contain keys", async () => {
    const seen: unknown[] = [];
    const s = new ResilientStore({ primary: failing(), fallback: new MemoryStore(), onFailure: "memory", onEvent: (e) => seen.push(e) });
    await s.hit("rl:v1:login:acct:SECRETKEY", 60, 5);
    expect(JSON.stringify(seen)).not.toContain("SECRETKEY");
  });
});
