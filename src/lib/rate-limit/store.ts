/**
 * src/lib/rate-limit/store.ts
 *
 * Counter storage for the rate limiter: a Redis store (atomic, shared by every app instance), a bounded in-process store
 * (per instance), and a ResilientStore that decides what happens when Redis is unavailable.
 *
 * ALGORITHM: EXACT SLIDING-WINDOW LOG. Each counter keeps the timestamps of the requests it ADMITTED during the last
 * `windowSeconds`. A request is admitted only if fewer than `max` admitted timestamps are younger than the window; a refused
 * request records nothing. Consequences, all covered by tests:
 *   - at most `max` requests are admitted in ANY interval of length `windowSeconds` (the fixed-window design this replaces
 *     admitted up to 2x `max` within a few milliseconds across a window boundary);
 *   - a refused request never extends a block, so traffic during a lockout cannot keep it alive, and Retry-After is exact:
 *     the moment the oldest admitted timestamp leaves the window;
 *   - there is no state that outlives its usefulness: the key expires `windowSeconds` after the last admission.
 * Cost: memory is O(max) per counter (<= a few hundred entries with the default policy; the policy caps `max` at 10 000).
 *
 * ATOMICITY (Redis). Pruning, counting and recording happen in ONE Lua script, and the key's expiry is set by the same script
 * on every admission, so there is no window in which a counter exists without an expiry and no read-then-write race: with a
 * limit of N, exactly N concurrent requests are admitted, from one instance or many. Time comes from Redis (TIME), so
 * application instances with skewed clocks agree.
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
import { randomUUID } from "node:crypto";
import { ServiceUnavailableException } from "@/lib/api-response";

export interface HitResult {
  /** True when the request was admitted (and recorded). False when `max` admitted requests are already inside the window. */
  allowed: boolean;
  /** Admitted requests currently inside the window, including this one when it was admitted. */
  count: number;
  /** When refused: milliseconds until a slot frees up (the oldest admitted request leaves the window). 0 when admitted. */
  retryAfterMs: number;
}

export interface CounterStore {
  /** Atomically admits-and-records the request if fewer than `max` are inside the last `windowSeconds`; otherwise refuses without recording. */
  hit(key: string, windowSeconds: number, max: number): Promise<HitResult>;
  /** Removes the most recent admitted entry of `key` (undo one admission, e.g. a login that turned out to be legitimate). No-op when empty. */
  refund(key: string): Promise<void>;
  /** Forgets every entry of `key` (e.g. a successful login clears the account+IP counter). */
  reset(key: string): Promise<void>;
  setFlag(key: string, ttlSeconds: number): Promise<void>;
  hasFlag(key: string): Promise<boolean>;
}

/* --------------------------------- Redis ---------------------------------- */

export const HIT_SCRIPT = `
local t = redis.call('TIME')
local now = t[1] * 1000 + math.floor(t[2] / 1000)
local windowMs = tonumber(ARGV[1])
local max = tonumber(ARGV[2])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now - windowMs)
local n = redis.call('ZCARD', KEYS[1])
if n < max then
  redis.call('ZADD', KEYS[1], now, ARGV[3])
  redis.call('PEXPIRE', KEYS[1], windowMs)
  return {1, n + 1, 0}
end
local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
local retry = tonumber(oldest[2]) + windowMs - now
if retry < 1 then retry = 1 end
return {0, n, retry}
`;

export const REFUND_SCRIPT = `
redis.call('ZPOPMAX', KEYS[1])
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

  async hit(key: string, windowSeconds: number, max: number): Promise<HitResult> {
    const res = await this.redis.eval(HIT_SCRIPT, 1, key, windowSeconds * 1000, max, randomUUID());
    if (!Array.isArray(res) || res.length !== 3) throw new Error("Redis returned an unexpected hit result");
    const [allowed, count, retryAfterMs] = [Number(res[0]), Number(res[1]), Number(res[2])];
    if (![allowed, count, retryAfterMs].every(Number.isFinite)) throw new Error("Redis returned a non-numeric hit result");
    return { allowed: allowed === 1, count, retryAfterMs };
  }
  async refund(key: string): Promise<void> {
    await this.redis.eval(REFUND_SCRIPT, 1, key);
  }
  async reset(key: string): Promise<void> {
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

interface Entry { times: number[]; windowMs: number }

export class MemoryStore implements CounterStore {
  private readonly map = new Map<string, Entry>();
  private readonly flags = new Map<string, number>();
  constructor(
    private readonly now: () => number = Date.now,
    private readonly maxKeys = 10_000
  ) {}

  /** Number of live keys (for tests and metrics). */
  get size(): number {
    return this.map.size + this.flags.size;
  }

  /** Live keys (for tests: asserting that no identifier or address is stored in clear). */
  keys(): string[] {
    return [...this.map.keys(), ...this.flags.keys()];
  }

  private prune(key: string, e: Entry): Entry | undefined {
    const cutoff = this.now() - e.windowMs;
    let i = 0;
    while (i < e.times.length && e.times[i]! <= cutoff) i++;
    if (i > 0) e.times.splice(0, i);
    if (e.times.length === 0) {
      this.map.delete(key);
      return undefined;
    }
    return e;
  }

  private makeRoom(): void {
    if (this.map.size + this.flags.size < this.maxKeys) return;
    const t = this.now();
    for (const [k, e] of this.map) if (e.times.length === 0 || e.times[e.times.length - 1]! + e.windowMs <= t) this.map.delete(k);
    for (const [k, exp] of this.flags) if (exp <= t) this.flags.delete(k);
    // Still full: drop the oldest ~10% (Map iterates in insertion order). Bounds memory under a key-flood; an attacker
    // would need thousands of distinct client buckets to evict anything, and per-IP limits cap how fast those can be created.
    if (this.map.size + this.flags.size >= this.maxKeys) {
      let drop = Math.ceil(this.maxKeys / 10);
      for (const k of this.map.keys()) {
        if (drop-- <= 0) break;
        this.map.delete(k);
      }
    }
  }

  async hit(key: string, windowSeconds: number, max: number): Promise<HitResult> {
    const windowMs = windowSeconds * 1000;
    const now = this.now();
    let e = this.map.get(key);
    if (e) {
      e.windowMs = windowMs;
      e = this.prune(key, e);
    }
    if (!e) {
      this.makeRoom();
      e = { times: [], windowMs };
    }
    if (e.times.length < max) {
      e.times.push(now);
      this.map.set(key, e);
      return { allowed: true, count: e.times.length, retryAfterMs: 0 };
    }
    return { allowed: false, count: e.times.length, retryAfterMs: Math.max(1, e.times[0]! + windowMs - now) };
  }
  async refund(key: string): Promise<void> {
    const e = this.map.get(key);
    if (!e) return;
    e.times.pop();
    if (e.times.length === 0) this.map.delete(key);
  }
  async reset(key: string): Promise<void> {
    this.map.delete(key);
  }
  async setFlag(key: string, ttlSeconds: number): Promise<void> {
    this.makeRoom();
    this.flags.set(key, this.now() + ttlSeconds * 1000);
  }
  async hasFlag(key: string): Promise<boolean> {
    const exp = this.flags.get(key);
    if (exp === undefined) return false;
    if (exp <= this.now()) {
      this.flags.delete(key);
      return false;
    }
    return true;
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

  hit(key: string, windowSeconds: number, max: number) { return this.run((s) => s.hit(key, windowSeconds, max)); }
  refund(key: string) { return this.run((s) => s.refund(key)); }
  reset(key: string) { return this.run((s) => s.reset(key)); }
  setFlag(key: string, ttlSeconds: number) { return this.run((s) => s.setFlag(key, ttlSeconds)); }
  hasFlag(key: string) { return this.run((s) => s.hasFlag(key)); }
}
