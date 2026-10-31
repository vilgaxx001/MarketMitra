/**
 * src/lib/rate-limit/policy.ts
 *
 * The rate-limit POLICY: every threshold in one typed object with documented defaults, plus a strict, validated override
 * (RATE_LIMIT_POLICY_JSON). Pure module: it imports nothing from the app (src/lib/env.ts imports it to fail fast on a bad
 * override), so it can be unit-tested without a server, Redis or environment.
 *
 * Why these defaults (full rationale and operational trade-offs: docs/RATE_LIMITING.md):
 *   - Windows are SLIDING windows (exact, see store.ts): at most `max` requests are admitted in ANY interval of `windowSeconds`,
 *     refused requests are not recorded, so a block always ends at a known time and attacker traffic cannot keep it alive.
 *     (The earlier fixed-window design let a client make 2x the limit within milliseconds across a window boundary.)
 *   - login: an online guesser needs thousands of attempts; a person mistyping needs a handful. 5 attempts / 15 min for
 *     one account from one IP leaves room for typos but makes a 10^6-guess list take years from one address. The
 *     account-wide limit counts only IPs that have NOT recently logged in successfully to that account, so an attacker
 *     spraying one account from many addresses is slowed while the real owner on a known device is not locked out.
 *   - SHARED ADDRESSES (CGNAT, offices, campuses). One IPv4 address can be thousands of people, so a per-IP limit must never be
 *     the control that protects an individual. The strict, per-person controls are keyed on the ACCOUNT / E-MAIL (login
 *     account+IP, account-wide for unrecognised IPs, signup/forgot-password/contact per address). The per-IP limits are flood
 *     ceilings sized for a busy shared address: the login one counts only FAILED logins (a success refunds it), because a
 *     credential-stuffing run is almost all failures and a shared address full of legitimate users is almost all successes.
 *   - Token endpoints (reset-password, verify-email): tokens carry 286 bits of entropy so guessing is infeasible; the per-IP
 *     limit exists to stop cheap resource abuse and probing, not to protect the secret. There is deliberately NO per-token
 *     limit: a guesser changes the token every request and would get a fresh counter each time, so it would add keys and
 *     code without adding protection.
 *   - AI execution is limited per WORKSPACE (cost control) and, when Redis is unavailable, falls back to the same in-process
 *     limit or refuses (RATE_LIMIT_ON_STORE_FAILURE); it never becomes unlimited.
 *
 * Nothing here is a claim that the numbers are optimal for production traffic: they are conservative starting points and
 * must be tuned from real traffic. Every one is overridable without a code change.
 */
import { z } from "zod";

export interface Limit {
  /** Requests allowed per window. */
  max: number;
  /** Window length in seconds. Fixed window: set at the first request, never extended. */
  windowSeconds: number;
}

export interface RateLimitPolicy {
  login: {
    /** FAILED login attempts from one client IP (a successful login refunds its attempt). A flood ceiling for shared addresses, not a per-person control. */
    ip: Limit;
    /** Attempts for one account from one client IP. Cleared by a successful login. Never a permanent lock: the window just ends. */
    accountIp: Limit;
    /** Attempts for one account across all IPs that have not logged in to it successfully within `knownIpTtlSeconds`. */
    accountUnrecognizedIp: Limit;
    /** How long a successful login keeps its IP "recognised" for that account. */
    knownIpTtlSeconds: number;
  };
  signup: { ip: Limit; email: Limit };
  forgotPassword: { ip: Limit; email: Limit };
  resetPassword: { ip: Limit };
  verifyEmail: { ip: Limit };
  contact: { ip: Limit; email: Limit };
  demoGenerate: { ip: Limit };
  /** Authenticated AI executions (src/modules/ai/core). Keyed per workspace: the unit that is billed. */
  aiExecution: { workspace: Limit };
  /**
   * When no trusted client IP can be determined (no trusted proxy configured) every such request shares ONE bucket per
   * endpoint. One bucket would let a single caller exhaust it for everyone, so its limit is multiplied by this factor:
   * it is a flood ceiling, not a per-client control. Configure TRUSTED_PROXY_HOPS or TRUSTED_IP_HEADER to get real
   * per-client limits.
   */
  unknownIpMultiplier: number;
}

const HOUR = 3600;
const QUARTER_HOUR = 900;

export const DEFAULT_POLICY: RateLimitPolicy = {
  login: {
    ip: { max: 60, windowSeconds: QUARTER_HOUR },
    accountIp: { max: 5, windowSeconds: QUARTER_HOUR },
    accountUnrecognizedIp: { max: 20, windowSeconds: HOUR },
    knownIpTtlSeconds: 30 * 24 * HOUR,
  },
  signup: { ip: { max: 10, windowSeconds: HOUR }, email: { max: 3, windowSeconds: HOUR } },
  forgotPassword: { ip: { max: 10, windowSeconds: HOUR }, email: { max: 3, windowSeconds: HOUR } },
  resetPassword: { ip: { max: 30, windowSeconds: HOUR } },
  verifyEmail: { ip: { max: 30, windowSeconds: HOUR } },
  contact: { ip: { max: 10, windowSeconds: HOUR }, email: { max: 3, windowSeconds: HOUR } },
  demoGenerate: { ip: { max: 20, windowSeconds: HOUR } },
  aiExecution: { workspace: { max: 20, windowSeconds: 60 } },
  unknownIpMultiplier: 10,
};

/* ----------------------------- override validation ---------------------------- */

// Lower bound 1: a limit of 0 would deny everything and is a misconfiguration, not a policy. Upper bounds stop typos
// (an extra zero) from silently disabling a control: 10000 requests per window is the ceiling (the sliding-window log keeps
// one entry per admitted request, so memory is O(max) per counter), 7 days the longest window.
const max = z.number().int().min(1).max(10_000);
const windowSeconds = z.number().int().min(1).max(7 * 24 * HOUR);
const limitOverride = z.object({ max: max.optional(), windowSeconds: windowSeconds.optional() }).strict();

const overrideSchema = z
  .object({
    login: z
      .object({
        ip: limitOverride.optional(),
        accountIp: limitOverride.optional(),
        accountUnrecognizedIp: limitOverride.optional(),
        knownIpTtlSeconds: z.number().int().min(1).max(365 * 24 * HOUR).optional(),
      })
      .strict()
      .optional(),
    signup: z.object({ ip: limitOverride.optional(), email: limitOverride.optional() }).strict().optional(),
    forgotPassword: z.object({ ip: limitOverride.optional(), email: limitOverride.optional() }).strict().optional(),
    resetPassword: z.object({ ip: limitOverride.optional() }).strict().optional(),
    verifyEmail: z.object({ ip: limitOverride.optional() }).strict().optional(),
    contact: z.object({ ip: limitOverride.optional(), email: limitOverride.optional() }).strict().optional(),
    demoGenerate: z.object({ ip: limitOverride.optional() }).strict().optional(),
    aiExecution: z.object({ workspace: limitOverride.optional() }).strict().optional(),
    unknownIpMultiplier: z.number().int().min(1).max(1000).optional(),
  })
  .strict();

export type PolicyOverride = z.infer<typeof overrideSchema>;

export type PolicyParseResult = { ok: true; policy: RateLimitPolicy } | { ok: false; error: string };

function mergeLimit(base: Limit, o?: { max?: number; windowSeconds?: number }): Limit {
  return { max: o?.max ?? base.max, windowSeconds: o?.windowSeconds ?? base.windowSeconds };
}

/** Builds the effective policy from the defaults plus an optional JSON override string. Never throws. */
export function parsePolicy(json: string | undefined): PolicyParseResult {
  if (json === undefined || json.trim() === "") return { ok: true, policy: DEFAULT_POLICY };
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, error: "RATE_LIMIT_POLICY_JSON is not valid JSON" };
  }
  const parsed = overrideSchema.safeParse(raw);
  if (!parsed.success) {
    // Paths and messages only: the override can carry no secret, but echoing arbitrary input is never needed.
    const detail = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    return { ok: false, error: `RATE_LIMIT_POLICY_JSON is invalid: ${detail}` };
  }
  const o = parsed.data;
  const d = DEFAULT_POLICY;
  return {
    ok: true,
    policy: {
      login: {
        ip: mergeLimit(d.login.ip, o.login?.ip),
        accountIp: mergeLimit(d.login.accountIp, o.login?.accountIp),
        accountUnrecognizedIp: mergeLimit(d.login.accountUnrecognizedIp, o.login?.accountUnrecognizedIp),
        knownIpTtlSeconds: o.login?.knownIpTtlSeconds ?? d.login.knownIpTtlSeconds,
      },
      signup: { ip: mergeLimit(d.signup.ip, o.signup?.ip), email: mergeLimit(d.signup.email, o.signup?.email) },
      forgotPassword: { ip: mergeLimit(d.forgotPassword.ip, o.forgotPassword?.ip), email: mergeLimit(d.forgotPassword.email, o.forgotPassword?.email) },
      resetPassword: { ip: mergeLimit(d.resetPassword.ip, o.resetPassword?.ip) },
      verifyEmail: { ip: mergeLimit(d.verifyEmail.ip, o.verifyEmail?.ip) },
      contact: { ip: mergeLimit(d.contact.ip, o.contact?.ip), email: mergeLimit(d.contact.email, o.contact?.email) },
      demoGenerate: { ip: mergeLimit(d.demoGenerate.ip, o.demoGenerate?.ip) },
      aiExecution: { workspace: mergeLimit(d.aiExecution.workspace, o.aiExecution?.workspace) },
      unknownIpMultiplier: o.unknownIpMultiplier ?? d.unknownIpMultiplier,
    },
  };
}
