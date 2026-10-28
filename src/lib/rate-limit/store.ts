/**
 * src/lib/rate-limit/store.ts
 *
 * Counter storage for the rate limiter: a Redis store (atomic, shared by every app instance), a bounded in-process store
 * (per instance), and a ResilientStore that decides what happens when Redis is unavailable.
 *
 * ATOMICITY. A counter is created WITH its expiry in one Lua script: INCR, and if the key has no TTL (new key, or one
 * stranded without expiry by an earlier crash) PEXPIRE it - all inside a single Redis command, so there is no window in
 * which a counter exists without an expiry (the INCR-then-EXPIRE race that can leave a key, and therefore a lockout, forever).
 * The TTL is set only when absent: later hits NEVER extend it, so traffic during a lockout cannot keep it alive. Parallel
 * requests are serialised by Redis, so with a limit of N exactly N concurrent requests are admitted.
 *
 * WHEN REDIS IS DOWN (ResilientStore). Protection is never silently dropped:
 *   - "memory" (default): the same policy is enforced by the in-process store. Limits are then per instance, so with k
 *     instances an attacker gets up to k x the limit; that is weaker but real protection, and it is logged.
 *   - "deny": the request is refused with 503 + Retry-After (fail closed) - for operators who would rather lose logins
 *     than run with weaker limits.
 * A circuit breaker keeps an outage cheap: after one failure Redis is not tried again for BREAKER_MS, so requests do not each
 * wait for a timeout. With no REDIS_URL at all the in-process store is used and a warning is logged once.
 *
 * Nothing in this file logs keys (they are keyed hashes, but there is no reason to write them to logs).
 */
import { ServiceUnavailableException } from "@/lib/api-response";

export interface HitResult {
  /** Counter value after this hit (1 = first request in the window). */
  count: number;
  /** Milliseconds until the window ends and the counter disappears. */
  ttlMs: number;
}

export interface CounterStore {
  /** Atomically increments `key`, creating it with a `windowSeconds` expiry if it has none. Never extends an existing expiry. */
  hit(key: string, windowSeconds: number): Promise<HitResult>;
  /** Decrements `key` but never below zero (a counter reaching zero is deleted). */
  decrFloor(key: string): Promise<void>;
  del(key: string): Promise<void>;
  setFlag(key: string, ttlSeconds: number): Promise<void>;
  hasFlag(key: string): Promise<boolean>;
}

/* --------------------------------- Redis ---------------------------------- */

export const HIT_SCRIPT = `
local c = redis.call('INCR', KEYS[1])
local t = redis.call('PTTL', KEYS[1])
if t < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  t = tonumber(ARGV[1])
end
return {c, t}
`;

export const DECR_FLOOR_SCRIPT = `
local v = tonumber(redis.call('GET', KEYS[1]) or '0')
if v > 1 then
  redis.call('DECR', KEYS[1])
else
  redis.call('DEL', KEYS[1])
end
return 0
`;

/** The slice of ioredis the store uses (so tests can inject a failing client). */
export interface RedisLike {
  eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
  set(key: string, value: string, mode: "EX", seconds: number): Promise<unknown>;
  exists(...keys: string[]): Promise<number>;
}

export class RedisStore implements CounterStore {
  constructor(private readonly redis: RedisLike) {}

  async hit(key: string, windowSeconds: number): Promise<HitResult> {
    const res = await this.redis.eval(HIT_SCRIPT, 1, key, windowSeconds * 1000);
    if (!Array.isArray(res) || res.length !== 2) throw new Error("Redis returned an unexpected hit result");
    const count = Number(res[0]);
    const ttlMs = Number(res[1]);
    if (!Number.isFinite(count) || !Number.isFinite(ttlMs)) throw new Error("Redis returned a non-numeric hit result");
    return { count, ttlMs };
  }
  async decrFloor(key: string): Promise<void> {
    await this.redis.eval(DECR_FLOOR_SCRIPT, 1, key);
  }
  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }
  async setFlag(key: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(key, "1", "EX", ttlSeconds);
  }
  async hasFlag(key: string): Promise<boolean> {
    return (await this.redis.exists(key)) === 1;
  }
}

/* -------------------------------- in-process ------------------------------- */

interface Entry { count: number; expiresAt: number }

export class MemoryStore implements CounterStore {
  private readonly map = new Map<string, Entry>();
  constructor(
    private readonly now: () => number = Date.now,
    private readonly maxKeys = 10_000
  ) {}

  /** Number of live keys (for tests and metrics). */
  get size(): number {
    return this.map.size;
  }

  /** Live keys (for tests: asserting that no identifier or address is stored in clear). */
  keys(): string[] {
    return [...this.map.keys()];
  }

  private live(key: string): Entry | undefined {
    const e = this.map.get(key);
    if (e && e.expiresAt <= this.now()) {
      this.map.delete(key);
      return undefined;
    }
    return e;
  }

  private makeRoom(): void {
    if (this.map.size < this.maxKeys) return;
    const t = this.now();
    for (const [k, e] of this.map) if (e.expiresAt <= t) this.map.delete(k);
    // Still full: drop the oldest ~10% (Map iterates in insertion order). Bounds memory under a key-flood; an attacker would
    // need thousands of distinct client buckets to evict anything, and per-IP limits cap how fast those can be created.
    if (this.map.size >= this.maxKeys) {
      let drop = Math.ceil(this.maxKeys / 10);
      for (const k of this.map.keys()) {
        if (drop-- <= 0) break;
        this.map.delete(k);
      }
    }
  }

  async hit(key: string, windowSeconds: number): Promise<HitResult> {
    const e = this.live(key);
    if (e) {
      e.count += 1;
      return { count: e.count, ttlMs: e.expiresAt - this.now() };
    }
    this.makeRoom();
    const created = { count: 1, expiresAt: this.now() + windowSeconds * 1000 };
    this.map.set(key, created);
    return { count: 1, ttlMs: windowSeconds * 1000 };
  }
  async decrFloor(key: string): Promise<void> {
    const e = this.live(key);
    if (!e) return;
    if (e.count > 1) e.count -= 1;
    else this.map.delete(key);
  }
  async del(key: string): Promise<void> {
    this.map.delete(key);
  }
  async setFlag(key: string, ttlSeconds: number): Promise<void> {
    this.makeRoom();
    this.map.set(key, { count: 1, expiresAt: this.now() + ttlSeconds * 1000 });
  }
  async hasFlag(key: string): Promise<boolean> {
    return this.live(key) !== undefined;
  }
}

/* -------------------------------- resilience ------------------------------- */

export type StoreFailureMode = "memory" | "deny";

export interface ResilientStoreOptions {
  /** The shared store (Redis), or null when none is configured. */
  primary: CounterStore | null;
  /** Used when `primary` is null or failing (mode "memory"). */
  fallback: CounterStore;
  onFailure: StoreFailureMode;
  /** Receives one event when the store degrades, one when it recovers, and one when it is not configured. No keys, no values. */
  onEvent?: (event: { kind: "degraded" | "recovered" | "not-configured"; error?: string }) => void;
  now?: () => number;
  /** After a failure, do not try the primary again for this long. */
  breakerMs?: number;
}

export const BREAKER_MS = 5_000;

export class ResilientStore implements CounterStore {
  private downUntil = 0;
  private degraded = false;
  private notifiedUnconfigured = false;
  private readonly now: () => number;
  private readonly breakerMs: number;

  constructor(private readonly o: ResilientStoreOptions) {
    this.now = o.now ?? Date.now;
    this.breakerMs = o.breakerMs ?? BREAKER_MS;
  }

  private async run<T>(op: (s: CounterStore) => Promise<T>): Promise<T> {
    const { primary } = this.o;
    if (!primary) {
      if (!this.notifiedUnconfigured) {
        this.notifiedUnconfigured = true;
        this.o.onEvent?.({ kind: "not-configured" });
      }
      return op(this.o.fallback);
    }
    if (this.now() < this.downUntil) return this.useFallback(op);
    try {
      const result = await op(primary);
      if (this.degraded) {
        this.degraded = false;
        this.o.onEvent?.({ kind: "recovered" });
      }
      return result;
    } catch (err) {
      this.downUntil = this.now() + this.breakerMs;
      if (!this.degraded) {
        this.degraded = true;
        this.o.onEvent?.({ kind: "degraded", error: err instanceof Error ? err.message : String(err) });
      }
      return this.useFallback(op);
    }
  }

  private useFallback<T>(op: (s: CounterStore) => Promise<T>): Promise<T> {
    if (this.o.onFailure === "deny") {
      throw new ServiceUnavailableException(Math.max(1, Math.ceil((this.downUntil - this.now()) / 1000)));
    }
    return op(this.o.fallback);
  }

  hit(key: string, windowSeconds: number) { return this.run((s) => s.hit(key, windowSeconds)); }
  decrFloor(key: string) { return this.run((s) => s.decrFloor(key)); }
  del(key: string) { return this.run((s) => s.del(key)); }
  setFlag(key: string, ttlSeconds: number) { return this.run((s) => s.setFlag(key, ttlSeconds)); }
  hasFlag(key: string) { return this.run((s) => s.hasFlag(key)); }
}
