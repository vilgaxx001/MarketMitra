/**
 * src/lib/rate-limit/limiter.ts
 *
 * Rate-limit decisions on top of a CounterStore. Pure of env and I/O except through the injected store, so the whole policy
 * is unit-testable (memory store, injected clock) and integration-testable (real Redis).
 *
 * KEYS. Identifiers (e-mail) never appear in a key: they are normalised (NFKC, trimmed, lower-cased - the same identity the
 * database uses plus Unicode compatibility folding so look-alike forms cannot dodge a counter) and then keyed with
 * HMAC-SHA-256 under a server secret, truncated to 128 bits. A Redis dump therefore does not list the e-mails that were
 * tried, and the keys cannot be recomputed offline without the secret. Client IPs are keyed as their bucket (see client-ip.ts).
 *
 * LOGIN. Three counters (sliding windows, see store.ts):
 *   1. per client IP (flood control). Enforced by the ROUTE through enforceIp("login") BEFORE the body is read, so a flood
 *      costs one admission and no parsing. beginLogin deliberately does not repeat it: counting it twice per attempt halved
 *      the configured limit (found by the route-level tests). A SUCCESSFUL login refunds its admission, so the counter holds
 *      FAILED logins only: a credential-stuffing run is almost all failures, while a shared address (CGNAT, office, campus)
 *      full of legitimate users is almost all successes and is not throttled by its neighbours' good logins;
 *   2. per account + IP, every attempt, cleared by a successful login (the brute-force control: 5 guesses / 15 min / pair);
 *   3. per account across all IPs NOT recently seen succeeding for that account (distributed guessing).
 *   beginLogin counts 2 and 3.
 * Counters admit attempts BEFORE the password is checked (the admit is one atomic script), so parallel requests cannot all slip
 * through a "check then record the failure" gap: with a limit of N, exactly N are admitted.
 *
 * NO PERMANENT LOCKOUT. Every block ends on its own at a known time; refused attempts are not recorded, so they do not extend it. A
 * block keyed on account + IP cannot be used by an attacker to lock the owner out from the owner's own address, and the
 * account-wide counter (3) ignores addresses the owner has logged in from recently. The remaining denial-of-service surface
 * is "owner on a NEW address while an attacker is actively spraying the account": at most one window (default 1 h) per
 * 20 attacker attempts. Documented in docs/RATE_LIMITING.md.
 *
 * NO ENUMERATION. Every counter is keyed on what the client SUBMITTED, never on whether the account exists, and every refusal
 * is the same RateLimitedException (same body, only Retry-After differs). An unknown address and a real one are throttled
 * identically.
 */
import { createHmac } from "node:crypto";
import { RateLimitedException } from "@/lib/api-response";
import type { ClientIp } from "@/lib/rate-limit/client-ip";
import type { Limit, RateLimitPolicy } from "@/lib/rate-limit/policy";
import type { CounterStore } from "@/lib/rate-limit/store";

export type IpEndpoint = "login" | "signup" | "forgotPassword" | "resetPassword" | "verifyEmail" | "contact" | "demoGenerate";
export type EmailEndpoint = "signup" | "forgotPassword" | "contact";

/** Hard ceiling on the effective limit of any counter (the sliding-window log keeps one entry per admitted request). */
export const MAX_EFFECTIVE_LIMIT = 10_000;

/** Same identity the database uses (lower-cased, trimmed) plus Unicode compatibility folding. */
export function normalizeIdentifier(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase();
}

export interface LimiterDeps {
  store: CounterStore;
  policy: RateLimitPolicy;
  /** Server-side secret for keying identifiers (the app passes SESSION_SECRET). */
  secret: string;
  /** Called when a counter trips; for metrics/logging. Receives no identifiers. */
  onBlocked?: (e: { endpoint: string; scope: "ip" | "identifier" | "account-ip" | "account" | "workspace" }) => void;
}

export interface LoginAttempt {
  /** Call once the password has been verified. Clears the account+IP counter, refunds the IP flood counter, remembers the IP for this account. Never throws. */
  succeeded(): Promise<void>;
}

export class RateLimiter {
  constructor(private readonly d: LimiterDeps) {}

  private keyed(namespace: string, value: string): string {
    return createHmac("sha256", this.d.secret).update(`rl:v1:${namespace}\0${value}`).digest("hex").slice(0, 32);
  }

  private ipLimit(endpoint: IpEndpoint): Limit {
    const p = this.d.policy;
    return endpoint === "login" ? p.login.ip : p[endpoint].ip;
  }

  /** Flood ceiling when the client IP is unknown (see policy.unknownIpMultiplier). */
  private scaled(limit: Limit, ip: ClientIp): Limit {
    return ip.address === null ? { ...limit, max: Math.min(limit.max * this.d.policy.unknownIpMultiplier, MAX_EFFECTIVE_LIMIT) } : limit;
  }

  private ipKey(endpoint: IpEndpoint, ip: ClientIp): string {
    return `rl:v1:${endpoint}:ip:${ip.bucket}`;
  }

  private async hitOrThrow(key: string, limit: Limit, endpoint: string, scope: "ip" | "identifier" | "account-ip" | "account"): Promise<void> {
    const r = await this.d.store.hit(key, limit.windowSeconds, limit.max);
    if (!r.allowed) {
      this.d.onBlocked?.({ endpoint, scope });
      throw new RateLimitedException(Math.max(1, Math.ceil(r.retryAfterMs / 1000)));
    }
  }

  /** Per-client-IP limit for an endpoint. Throws RateLimitedException when exceeded. Call BEFORE reading the body. */
  async enforceIp(endpoint: IpEndpoint, ip: ClientIp): Promise<void> {
    await this.hitOrThrow(this.ipKey(endpoint, ip), this.scaled(this.ipLimit(endpoint), ip), endpoint, "ip");
  }

  /**
   * Per-workspace limit on AI executions (cost control). Reports instead of throwing so the caller can map it onto its own error
   * type. A store failure follows RATE_LIMIT_ON_STORE_FAILURE: in-process enforcement ("memory") or ServiceUnavailableException ("deny").
   */
  async checkWorkspaceAi(workspaceId: string, maxOverride?: number): Promise<{ allowed: boolean; limit: number; remaining: number; retryAfterSeconds: number }> {
    const base = this.d.policy.aiExecution.workspace;
    const limit = Math.min(maxOverride ?? base.max, MAX_EFFECTIVE_LIMIT);
    const r = await this.d.store.hit(`rl:v1:ai:ws:${workspaceId}`, base.windowSeconds, limit);
    if (!r.allowed) this.d.onBlocked?.({ endpoint: "aiExecution", scope: "workspace" });
    return { allowed: r.allowed, limit, remaining: Math.max(0, limit - r.count), retryAfterSeconds: r.allowed ? 0 : Math.max(1, Math.ceil(r.retryAfterMs / 1000)) };
  }

  /**
   * Per-identifier (e-mail) limit. Returns false instead of throwing so the caller can choose between a 429 (signup, contact)
   * and a silent no-op that keeps the response identical (forgot-password).
   */
  async allowEmail(endpoint: EmailEndpoint, email: string): Promise<boolean> {
    const limit = this.d.policy[endpoint].email;
    const r = await this.d.store.hit(`rl:v1:${endpoint}:email:${this.keyed(endpoint, normalizeIdentifier(email))}`, limit.windowSeconds, limit.max);
    if (!r.allowed) {
      this.d.onBlocked?.({ endpoint, scope: "identifier" });
      return false;
    }
    return true;
  }

  async enforceEmail(endpoint: EmailEndpoint, email: string): Promise<void> {
    const limit = this.d.policy[endpoint].email;
    await this.hitOrThrow(`rl:v1:${endpoint}:email:${this.keyed(endpoint, normalizeIdentifier(email))}`, limit, endpoint, "identifier");
  }

  /**
   * Counts one login attempt against the per-account counters (2 and 3 above) and throws RateLimitedException if either is
   * exhausted. The caller must already have passed enforceIp("login", ip).
   */
  async beginLogin(ip: ClientIp, email: string): Promise<LoginAttempt> {
    const { login } = this.d.policy;
    const account = normalizeIdentifier(email);
    const accountId = this.keyed("login-account", account);
    const pairId = this.keyed("login-pair", `${account}\0${ip.bucket}`);
    const acctKey = `rl:v1:login:acct:${accountId}`;
    const pairKey = `rl:v1:login:pair:${pairId}`;
    const knownKey = `rl:v1:login:known:${pairId}`;
    // An address we cannot identify is never "recognised": one success from the shared unknown bucket must not exempt everyone.
    const identifiable = ip.address !== null;

    await this.hitOrThrow(pairKey, login.accountIp, "login", "account-ip");
    const known = identifiable && (await this.d.store.hasFlag(knownKey));
    if (!known) await this.hitOrThrow(acctKey, login.accountUnrecognizedIp, "login", "account");
    const ipKey = this.ipKey("login", ip);

    return {
      succeeded: async () => {
        try {
          await this.d.store.reset(pairKey);
          // The route admitted this attempt against the per-IP flood counter before the body was read; a success is not a flood.
          await this.d.store.refund(ipKey);
          if (identifiable) {
            await this.d.store.setFlag(knownKey, login.knownIpTtlSeconds);
            // This attempt was counted against the account-wide limit as an unrecognised address; it just proved itself.
            if (!known) await this.d.store.refund(acctKey);
          }
        } catch {
          // A failed bookkeeping write must never turn a correct login into an error; the counters just expire by themselves.
        }
      },
    };
  }
}
