/**
 * src/lib/rate-limit/index.ts
 *
 * The one import routes use for rate limiting. Binds the pure pieces (policy, client-ip, store, limiter) to the validated
 * environment: REDIS_URL, TRUSTED_IP_HEADER / TRUSTED_PROXY_HOPS, RATE_LIMIT_POLICY_JSON, RATE_LIMIT_ON_STORE_FAILURE and
 * SESSION_SECRET (used only to key identifiers). Design, defaults and trade-offs: docs/RATE_LIMITING.md.
 *
 * Typical route:
 *   const ip = await enforceIpLimit(req, "signup");      // BEFORE reading the body: 429 costs no parsing
 *   const body = await readJsonBody(req, LIMIT);         // bounded, see src/lib/bounded-json.ts
 *   ...validate...
 *   await enforceEmailLimit("signup", input.email);      // keyed on what was submitted, never on whether the account exists
 *
 * Logging: events carry the endpoint, the scope that tripped and (for outages) the client library's error message. Never a
 * password, token, e-mail, IP or key. Blocks are logged at most once per endpoint+scope per minute so an attack cannot also
 * flood the log.
 */
import "server-only";
import Redis from "ioredis";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { DEFAULT_POLICY, parsePolicy } from "@/lib/rate-limit/policy";
import { resolveClientIp, type ClientIp } from "@/lib/rate-limit/client-ip";
import { MemoryStore, RedisStore, ResilientStore } from "@/lib/rate-limit/store";
import { RateLimiter, type EmailEndpoint, type IpEndpoint, type LoginAttempt } from "@/lib/rate-limit/limiter";

export type { ClientIp, EmailEndpoint, IpEndpoint, LoginAttempt };

const BLOCK_LOG_INTERVAL_MS = 60_000;
const lastBlockLog = new Map<string, number>();

function logBlocked(e: { endpoint: string; scope: string }): void {
  const k = `${e.endpoint}:${e.scope}`;
  const now = Date.now();
  if (now - (lastBlockLog.get(k) ?? 0) < BLOCK_LOG_INTERVAL_MS) return;
  lastBlockLog.set(k, now);
  logger.warn({ msg: "rate_limit_blocked", endpoint: e.endpoint, scope: e.scope });
}

let redis: Redis | null = null;
function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(env.REDIS_URL!, {
      maxRetriesPerRequest: 1,
      connectTimeout: 1_500,
      commandTimeout: 1_000,
      retryStrategy: (times) => Math.min(times * 200, 2_000),
    });
    // An unhandled 'error' event would crash the process. The failure is reported once by the ResilientStore.
    redis.on("error", () => undefined);
  }
  return redis;
}

let limiter: RateLimiter | null = null;
function getLimiter(): RateLimiter {
  if (limiter) return limiter;
  const parsed = parsePolicy(env.RATE_LIMIT_POLICY_JSON);
  // env.ts already refused to boot on an invalid override; the fallback keeps the type total.
  const policy = parsed.ok ? parsed.policy : DEFAULT_POLICY;
  const store = new ResilientStore({
    primary: env.REDIS_URL ? new RedisStore(getRedis()) : null,
    fallback: new MemoryStore(),
    onFailure: env.RATE_LIMIT_ON_STORE_FAILURE,
    onEvent: (e) => {
      if (e.kind === "degraded") {
        logger.error({ msg: "rate_limit_store_degraded", mode: env.RATE_LIMIT_ON_STORE_FAILURE, err: e.error });
      } else if (e.kind === "recovered") {
        logger.info({ msg: "rate_limit_store_recovered" });
      } else {
        logger.warn({ msg: "rate_limit_store_not_configured", detail: "REDIS_URL is unset: limits are enforced per instance, in memory" });
      }
    },
  });
  limiter = new RateLimiter({ store, policy, secret: env.SESSION_SECRET, onBlocked: logBlocked });
  return limiter;
}

/** The client IP according to the deployment's trusted-proxy configuration (never a raw, client-forgeable header). */
export function clientIpOf(req: Request): ClientIp {
  return resolveClientIp(req.headers, { trustedProxyHops: env.TRUSTED_PROXY_HOPS, trustedIpHeader: env.TRUSTED_IP_HEADER });
}

/** Per-IP limit for `endpoint`; throws RateLimitedException (429 + Retry-After) when exceeded. Returns the resolved client IP. */
export async function enforceIpLimit(req: Request, endpoint: IpEndpoint): Promise<ClientIp> {
  const ip = clientIpOf(req);
  await getLimiter().enforceIp(endpoint, ip);
  return ip;
}

/** Per-e-mail limit; throws RateLimitedException when exceeded. */
export function enforceEmailLimit(endpoint: EmailEndpoint, email: string): Promise<void> {
  return getLimiter().enforceEmail(endpoint, email);
}

/** Per-e-mail limit that reports instead of throwing, for flows whose response must not change (forgot-password). */
export function allowEmail(endpoint: EmailEndpoint, email: string): Promise<boolean> {
  return getLimiter().allowEmail(endpoint, email);
}

/** Counts one login attempt (per IP, per account+IP, per account for unrecognised IPs); throws RateLimitedException when exhausted. */
export function beginLoginAttempt(ip: ClientIp, email: string): Promise<LoginAttempt> {
  return getLimiter().beginLogin(ip, email);
}
