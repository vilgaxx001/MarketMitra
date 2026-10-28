import { describe, it, expect, vi } from "vitest";
import { MemoryStore, RedisStore, ResilientStore, type CounterStore, type RedisLike } from "@/lib/rate-limit/store";
import { ServiceUnavailableException } from "@/lib/api-response";

const clock = () => { let t = 5_000_000; return { now: () => t, advance: (ms: number) => { t += ms; } }; };

describe("MemoryStore", () => {
  it("creates a counter with a window and never extends it on later hits", async () => {
    const c = clock(); const s = new MemoryStore(c.now);
    expect(await s.hit("k", 10)).toEqual({ count: 1, ttlMs: 10_000 });
    c.advance(4_000);
    expect(await s.hit("k", 10)).toEqual({ count: 2, ttlMs: 6_000 }); // the window did not restart
    c.advance(6_001);
    expect(await s.hit("k", 10)).toEqual({ count: 1, ttlMs: 10_000 }); // expired -> fresh window
  });
  it("decrFloor never goes below zero and deletes an emptied counter", async () => {
    const s = new MemoryStore(); await s.hit("k", 60); await s.hit("k", 60);
    await s.decrFloor("k"); expect((await s.hit("k", 60)).count).toBe(2);
    await s.decrFloor("k"); await s.decrFloor("k"); await s.decrFloor("k");
    expect(s.size).toBe(0); await s.decrFloor("missing"); expect(s.size).toBe(0);
  });
  it("flags expire", async () => {
    const c = clock(); const s = new MemoryStore(c.now);
    await s.setFlag("f", 5); expect(await s.hasFlag("f")).toBe(true);
    c.advance(5_001); expect(await s.hasFlag("f")).toBe(false);
  });
  it("is bounded: a flood of distinct keys cannot grow it past maxKeys", async () => {
    const s = new MemoryStore(Date.now, 100);
    for (let i = 0; i < 1_000; i++) await s.hit(`k${i}`, 3600);
    expect(s.size).toBeLessThanOrEqual(100);
    expect((await s.hit("k999", 3600)).count).toBe(2); // newest keys survive eviction
  });
  it("purges expired keys before evicting live ones", async () => {
    const c = clock(); const s = new MemoryStore(c.now, 10);
    for (let i = 0; i < 10; i++) await s.hit(`old${i}`, 1);
    await s.hit("live", 3600);
    c.advance(2_000);
    for (let i = 0; i < 9; i++) await s.hit(`new${i}`, 3600);
    expect((await s.hit("live", 3600)).count).toBe(2);
  });
});

describe("RedisStore result validation", () => {
  const fake = (res: unknown): RedisLike => ({ eval: async () => res, del: async () => 1, set: async () => "OK", exists: async () => 1 });
  it("maps the script reply", async () => {
    expect(await new RedisStore(fake([3, 4500])).hit("k", 10)).toEqual({ count: 3, ttlMs: 4500 });
  });
  it.each([[null], [[1]], [["x", 1]], ["nope"]])("rejects a malformed reply %j instead of guessing", async (bad) => {
    await expect(new RedisStore(fake(bad)).hit("k", 10)).rejects.toThrow();
  });
});

function failing(): CounterStore {
  const boom = async () => { throw new Error("connect ECONNREFUSED"); };
  return { hit: boom, decrFloor: boom, del: boom, setFlag: boom, hasFlag: boom };
}

describe("ResilientStore: Redis outage never disables protection", () => {
  it("memory mode: keeps ENFORCING the same counters in-process and reports the outage once", async () => {
    const events: string[] = []; const c = clock();
    const s = new ResilientStore({ primary: failing(), fallback: new MemoryStore(c.now), onFailure: "memory", now: c.now, onEvent: (e) => events.push(e.kind) });
    const counts: number[] = [];
    for (let i = 0; i < 4; i++) counts.push((await s.hit("k", 60)).count);
    expect(counts).toEqual([1, 2, 3, 4]); // still counting, not "allowed because Redis is down"
    expect(events).toEqual(["degraded"]); // one event, not one per request
  });
  it("circuit breaker: after a failure Redis is not retried until the breaker interval has passed", async () => {
    const c = clock(); const primary = failing(); const spy = vi.spyOn(primary, "hit");
    const s = new ResilientStore({ primary, fallback: new MemoryStore(c.now), onFailure: "memory", now: c.now, breakerMs: 5_000 });
    await s.hit("k", 60); await s.hit("k", 60); await s.hit("k", 60);
    expect(spy).toHaveBeenCalledTimes(1);
    c.advance(5_001); await s.hit("k", 60);
    expect(spy).toHaveBeenCalledTimes(2);
  });
  it("recovers: when Redis answers again it is used again and the recovery is reported", async () => {
    const c = clock(); const events: string[] = [];
    let healthy = false; const real = new MemoryStore(c.now);
    const flaky: CounterStore = {
      hit: (k, w) => (healthy ? real.hit(k, w) : Promise.reject(new Error("down"))),
      decrFloor: (k) => real.decrFloor(k), del: (k) => real.del(k), setFlag: (k, t) => real.setFlag(k, t), hasFlag: (k) => real.hasFlag(k),
    };
    const s = new ResilientStore({ primary: flaky, fallback: new MemoryStore(c.now), onFailure: "memory", now: c.now, breakerMs: 1_000, onEvent: (e) => events.push(e.kind) });
    await s.hit("k", 60); healthy = true; c.advance(1_001);
    expect((await s.hit("k", 60)).count).toBe(1); // served by the primary again
    expect(events).toEqual(["degraded", "recovered"]);
  });
  it("deny mode: fails CLOSED with a 503 and a Retry-After, never 'allowed'", async () => {
    const c = clock();
    const s = new ResilientStore({ primary: failing(), fallback: new MemoryStore(c.now), onFailure: "deny", now: c.now, breakerMs: 5_000 });
    const first = await s.hit("k", 60).catch((e) => e);
    expect(first).toBeInstanceOf(ServiceUnavailableException);
    c.advance(1_000);
    const again = await s.hit("k", 60).catch((e) => e); // breaker open: still refused, without calling Redis
    expect(again).toBeInstanceOf(ServiceUnavailableException);
    expect(again.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(again.retryAfterSeconds).toBeLessThanOrEqual(5);
  });
  it("no primary configured: uses the in-process store and says so once", async () => {
    const events: string[] = [];
    const s = new ResilientStore({ primary: null, fallback: new MemoryStore(), onFailure: "memory", onEvent: (e) => events.push(e.kind) });
    expect((await s.hit("k", 60)).count).toBe(1); expect((await s.hit("k", 60)).count).toBe(2);
    expect(events).toEqual(["not-configured"]);
  });
  it("events never contain keys", async () => {
    const seen: unknown[] = [];
    const s = new ResilientStore({ primary: failing(), fallback: new MemoryStore(), onFailure: "memory", onEvent: (e) => seen.push(e) });
    await s.hit("rl:v1:login:acct:SECRETKEY", 60);
    expect(JSON.stringify(seen)).not.toContain("SECRETKEY");
  });
});
