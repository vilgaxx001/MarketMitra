import "server-only";
import { ServiceUnavailableException } from "@/lib/api-response";
import { logger } from "@/lib/logger";
import { checkWorkspaceAiLimit } from "@/lib/rate-limit";

export interface RateLimitCheckResult {
  allowed: boolean;
  /**
   * True when the limiter could not give a trustworthy answer and the request was REFUSED for that reason
   * (RATE_LIMIT_ON_STORE_FAILURE=deny while Redis is down). `allowed` is false in that case; the caller reports 503, not 429.
   */
  unavailable?: boolean;
  remaining?: number;
  limit?: number;
  /** Seconds until a retry can succeed (set when `allowed` is false). */
  retryAfterSeconds?: number;
}

/**
 * Sliding-window limit per workspace on AI executions: the cost control for paid provider calls. Policy and thresholds:
 * `aiExecution.workspace` in src/lib/rate-limit/policy.ts (default 20 / 60 s, override with RATE_LIMIT_POLICY_JSON), so at
 * most that many executions are admitted in ANY 60-second interval (no 2x burst across a window boundary).
 *
 * FAIL-SAFE POLICY (Module 5B.5 failed OPEN here; that was the finding). It now shares the limiter's store and its explicit
 * outage behaviour, so there is no configuration in which this check silently stops limiting:
 *   - Redis healthy: shared limit across all app instances, atomic (one Lua script; N concurrent requests admit exactly N).
 *   - REDIS_URL unset, or Redis unreachable, RATE_LIMIT_ON_STORE_FAILURE=memory (default): the same limit is enforced in
 *     this process. Worst-case spend is then (number of instances) x limit, still bounded; the degradation is logged once.
 *   - Redis unreachable, RATE_LIMIT_ON_STORE_FAILURE=deny: executions are REFUSED (503 + Retry-After) until Redis returns.
 *     Choose this when an unbounded-cost window matters more than availability.
 *   - Any unexpected error from the limiter itself: refused (fail closed), logged without identifiers beyond the workspace id.
 */
export async function checkAIExecutionRateLimit(workspaceId: string, maxRequestsPerWindow?: number): Promise<RateLimitCheckResult> {
  try {
    const r = await checkWorkspaceAiLimit(workspaceId, maxRequestsPerWindow);
    return { allowed: r.allowed, remaining: r.remaining, limit: r.limit, ...(r.allowed ? {} : { retryAfterSeconds: r.retryAfterSeconds }) };
  } catch (err) {
    if (err instanceof ServiceUnavailableException) {
      return { allowed: false, unavailable: true, retryAfterSeconds: err.retryAfterSeconds };
    }
    logger.error({ msg: "ai_rate_limit_check_failed_closed", workspaceId, errorName: err instanceof Error ? err.name : "unknown" });
    return { allowed: false, unavailable: true, retryAfterSeconds: 5 };
  }
}
