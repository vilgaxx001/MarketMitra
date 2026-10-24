import "server-only";
import Redis from "ioredis";
import { env, isRedisConfigured } from "@/lib/env";
import { logger } from "@/lib/logger";
const WINDOW_SECONDS = 60;
const DEFAULT_MAX_REQUESTS_PER_WINDOW = 20;
let client: Redis | null = null;
function getClient(): Redis {
  if (!client) {
    client = new Redis(env.REDIS_URL!, { maxRetriesPerRequest: 1, lazyConnect: true });
    client.on("error", (err) => { logger.warn({ msg: "ai_rate_limit_redis_error", err: err.message }); });
  }
  return client;
}
export interface RateLimitCheckResult { allowed: boolean; configured: boolean; remaining?: number; limit?: number; }
/**
 * Fixed-window counter per workspace. The window starts at the first request and lasts WINDOW_SECONDS.
 *
 * Atomicity (Module 5B.5): the key is created WITH its expiry in the same MULTI/EXEC transaction as the
 * increment (SET key 0 EX n NX; INCR key; TTL key). The earlier INCR-then-EXPIRE pair was two round trips:
 * a failure between them left a counter with NO expiry, and once it passed the limit the workspace stayed
 * denied permanently. If a key without expiry already exists (e.g. one stranded by that older code), TTL
 * reports -1 and the expiry is restored, so such keys heal themselves.
 *
 * Policy (unchanged): if Redis is unreachable the check FAILS OPEN (allowed, configured:false). This favours
 * availability over strict limiting and is a documented deployment risk.
 */
export async function checkAIExecutionRateLimit(workspaceId: string, maxRequestsPerWindow: number = DEFAULT_MAX_REQUESTS_PER_WINDOW): Promise<RateLimitCheckResult> {
  if (!isRedisConfigured) return { allowed: true, configured: false };
  const key = `ai:ratelimit:${workspaceId}`;
  try {
    const redis = getClient();
    const results = await redis.multi().set(key, "0", "EX", WINDOW_SECONDS, "NX").incr(key).ttl(key).exec();
    if (!results || results.length !== 3) throw new Error("Redis transaction returned no result.");
    for (const [err] of results) if (err) throw err;
    const count = Number(results[1]![1]);
    const ttl = Number(results[2]![1]);
    if (!Number.isFinite(count)) throw new Error("Redis returned a non-numeric counter.");
    if (ttl === -1) await redis.expire(key, WINDOW_SECONDS);
    return { allowed: count <= maxRequestsPerWindow, configured: true, remaining: Math.max(0, maxRequestsPerWindow - count), limit: maxRequestsPerWindow };
  } catch (err) {
    logger.warn({ msg: "ai_rate_limit_check_failed_open", workspaceId, err: err instanceof Error ? err.message : String(err) });
    return { allowed: true, configured: false };
  }
}
