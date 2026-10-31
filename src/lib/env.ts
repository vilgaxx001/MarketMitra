/**
 * src/lib/env.ts
 *
 * Single source of truth for every environment variable / secret used
 * anywhere in the application.
 *
 * WHY THIS FILE EXISTS (requirement #14 — "never hardcode secrets"):
 *   - No module is allowed to read `process.env.X` directly. Every secret,
 *     API key, and config value flows through this validated object.
 *   - On boot, every required variable is checked against a Zod schema.
 *     If anything is missing or malformed, the process throws immediately
 *     with a clear, actionable error — it does NOT fall back to a
 *     hardcoded default or silently continue in a half-configured state.
 *   - This is what makes "placeholder API keys" in .env.example safe:
 *     the app simply will not start against unset secrets, so there is
 *     no risk of accidentally shipping with a fake/missing key.
 *
 * USAGE:
 *   import { env } from "@/lib/env";
 *   env.DATABASE_URL          // fully typed, guaranteed present
 *   env.AI_PROVIDER           // typed union, not a loose string
 */

import { z } from "zod";
import { parsePolicy } from "@/lib/rate-limit/policy";

/* -------------------------------------------------------------------------
 * Schema
 * ---------------------------------------------------------------------- */

const envSchema = z.object({
  /* ---------- Core ---------- */
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z
    .string()
    .url()
    .describe("Public base URL of the app, e.g. https://app.marketmitra.ai"),
  APP_NAME: z.string().default("MarketMitra"),

  /* ---------- Database ---------- */
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required — see docs/SETUP.md")
    .startsWith("postgres", "DATABASE_URL must be a PostgreSQL connection string"),
  DIRECT_URL: z
    .string()
    .optional()
    .describe("Non-pooled connection string, required for Prisma migrations on serverless"),

  /* ---------- Auth / Sessions ---------- */
  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET must be at least 32 characters — generate with `openssl rand -base64 32`"),
  SESSION_COOKIE_NAME: z.string().default("marketmitra_session"),
  SESSION_MAX_AGE_DAYS: z.coerce.number().int().positive().default(30),

  /* ---------- Email (transactional) ---------- */
  EMAIL_PROVIDER: z.enum(["resend", "smtp"]).default("resend"),
  RESEND_API_KEY: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  EMAIL_FROM: z
    .string()
    .email()
    .default("MarketMitra <noreply@marketmitra.ai>")
    .or(z.string().min(1)),
  /** Destination inbox for the public /contact form (src/app/(marketing)/contact). Optional — until set, submissions are logged, not emailed. */
  CONTACT_INBOX_EMAIL: z.string().email().optional(),

  /* ---------- AI Provider Layer ---------- */
  AI_PROVIDER: z
    .enum(["openai", "anthropic", "gemini", "grok", "deepseek"])
    .default("anthropic")
    .describe("Default provider used by the AI Provider Factory when a workspace has no override"),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GROK_API_KEY: z.string().optional(),
  DEEPSEEK_API_KEY: z.string().optional(),

  /* ---------- Billing: Razorpay (primary, India) ---------- */
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),

  /* ---------- Billing: Stripe (secondary, international) ---------- */
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  /* ---------- File storage (logo / asset uploads) ---------- */
  STORAGE_PROVIDER: z.enum(["s3", "local"]).default("s3"),
  S3_BUCKET_NAME: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_PUBLIC_URL: z.string().url().optional(),

  /* ---------- Rate limiting / caching ---------- */
  REDIS_URL: z.string().optional(),
  /**
   * Which client-IP information the rate limiter may trust (src/lib/rate-limit/client-ip.ts). Default: none - x-forwarded-for
   * is ignored and every client shares one flood-ceiling bucket. Set exactly the one that matches the deployment:
   *   TRUSTED_IP_HEADER   name of a header the edge overwrites with the client IP (e.g. cf-connecting-ip, x-real-ip), or
   *   TRUSTED_PROXY_HOPS  number of reverse proxies that append to x-forwarded-for.
   * Setting either when the app is directly reachable by clients lets them choose their own rate-limit identity.
   */
  TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
  TRUSTED_IP_HEADER: z
    .string()
    .transform((v) => v.trim().toLowerCase() || undefined)
    .pipe(z.string().regex(/^[a-z0-9-]{1,64}$/, "must be a plain header name such as cf-connecting-ip").optional())
    .optional(),
  /** Optional JSON override of the rate-limit thresholds (strict, validated; see src/lib/rate-limit/policy.ts and docs/RATE_LIMITING.md). */
  RATE_LIMIT_POLICY_JSON: z
    .string()
    .optional()
    .superRefine((v, ctx) => {
      const r = parsePolicy(v);
      if (!r.ok) ctx.addIssue({ code: "custom", message: r.error });
    }),
  /** What the limiter does when Redis is unavailable: keep enforcing in-process ("memory", default) or refuse with 503 ("deny"). Never "allow". */
  RATE_LIMIT_ON_STORE_FAILURE: z.enum(["memory", "deny"]).default("memory"),
  /**
   * Production refuses to start without a trusted client-IP source (TRUSTED_IP_HEADER or TRUSTED_PROXY_HOPS) and without
   * REDIS_URL, because either gap silently weakens every limit. A deployment that really has neither (a single instance
   * directly on the internet, say) must say so explicitly with these acknowledgements; they change nothing else. Strings, not
   * booleans: z.coerce.boolean() would read "false" as true.
   */
  RATE_LIMIT_ALLOW_UNTRUSTED_CLIENT_IP: z.enum(["true", "false"]).default("false"),
  RATE_LIMIT_ALLOW_MEMORY_STORE: z.enum(["true", "false"]).default("false"),

  /* ---------- Monitoring / Logging ---------- */
  SENTRY_DSN: z.string().optional(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  /* ---------- Feature flags (platform-level defaults) ---------- */
  ENABLE_SIGNUPS: z.coerce.boolean().default(true),
  ENABLE_REFERRALS: z.coerce.boolean().default(true),
});

export type Env = z.infer<typeof envSchema>;

/* -------------------------------------------------------------------------
 * Cross-field validation
 * Some vars are only conditionally required (e.g. you only need Razorpay
 * keys if you intend to accept India payments). We validate these
 * relationships explicitly so misconfiguration fails at boot, not at
 * first checkout.
 * ---------------------------------------------------------------------- */

function validateConditionalRequirements(parsed: Env, rawEnv: NodeJS.ProcessEnv) {
  const problems: string[] = [];

  // Email provider cross-check
  if (parsed.EMAIL_PROVIDER === "resend" && !rawEnv.RESEND_API_KEY) {
    problems.push(
      "EMAIL_PROVIDER=resend but RESEND_API_KEY is not set. Email verification and password reset will not be able to send mail until this is configured. See docs/SETUP.md."
    );
  }
  if (
    parsed.EMAIL_PROVIDER === "smtp" &&
    (!rawEnv.SMTP_HOST || !rawEnv.SMTP_USER || !rawEnv.SMTP_PASSWORD)
  ) {
    problems.push(
      "EMAIL_PROVIDER=smtp requires SMTP_HOST, SMTP_USER, and SMTP_PASSWORD to all be set."
    );
  }

  // Client-IP trust configuration must be unambiguous: it decides who a request "is" for every rate limit.
  if (parsed.TRUSTED_IP_HEADER && parsed.TRUSTED_PROXY_HOPS > 0) {
    problems.push(
      "TRUSTED_IP_HEADER and TRUSTED_PROXY_HOPS are both set. Set exactly one: the header takes precedence and the hop count would be silently ignored."
    );
  }
  if (parsed.TRUSTED_IP_HEADER && ["x-forwarded-for", "forwarded"].includes(parsed.TRUSTED_IP_HEADER)) {
    problems.push(
      `TRUSTED_IP_HEADER=${parsed.TRUSTED_IP_HEADER} is a list header that clients can prepend to. Use TRUSTED_PROXY_HOPS (counted from the right) for x-forwarded-for, or a single-IP header your edge overwrites.`
    );
  }
  if (rawEnv.REDIS_URL && !/^rediss?:\/\//i.test(rawEnv.REDIS_URL)) {
    problems.push("REDIS_URL must start with redis:// or rediss://.");
  }

  // AI provider cross-check — only the *selected default* provider's key is
  // strictly required at boot; other provider keys are optional and are
  // validated lazily by the provider factory when a workspace selects them.
  const providerKeyMap: Record<Env["AI_PROVIDER"], keyof Env> = {
    openai: "OPENAI_API_KEY",
    anthropic: "ANTHROPIC_API_KEY",
    gemini: "GEMINI_API_KEY",
    grok: "GROK_API_KEY",
    deepseek: "DEEPSEEK_API_KEY",
  };
  const requiredKey = providerKeyMap[parsed.AI_PROVIDER];
  if (!rawEnv[requiredKey]) {
    problems.push(
      `AI_PROVIDER=${parsed.AI_PROVIDER} but ${requiredKey} is not set. AI generation will fail until this is configured.`
    );
  }

  // Storage cross-check
  if (parsed.STORAGE_PROVIDER === "s3") {
    const required = ["S3_BUCKET_NAME", "S3_REGION", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const;
    const missing = required.filter((k) => !rawEnv[k]);
    if (missing.length > 0) {
      problems.push(
        `STORAGE_PROVIDER=s3 but missing: ${missing.join(", ")}. Logo and asset uploads will fail until configured.`
      );
    }
  }

  // In production, billing keys are strongly recommended (warning, not fatal,
  // since a deployment may intentionally launch before payments go live).
  if (parsed.NODE_ENV === "production") {
    if (!rawEnv.RAZORPAY_KEY_ID && !rawEnv.STRIPE_SECRET_KEY) {
      // eslint-disable-next-line no-console
      console.warn(
        "[env] WARNING: Running in production with no Razorpay or Stripe keys configured. Billing endpoints will reject all checkout attempts until configured."
      );
    }
    if (!parsed.TRUSTED_IP_HEADER && parsed.TRUSTED_PROXY_HOPS === 0) {
      if (parsed.RATE_LIMIT_ALLOW_UNTRUSTED_CLIENT_IP === "true") {
        // eslint-disable-next-line no-console
        console.warn(
          "[env] WARNING: RATE_LIMIT_ALLOW_UNTRUSTED_CLIENT_IP=true: no trusted client-IP source is configured, so all requests to an endpoint share one flood-ceiling bucket and per-IP limits cannot tell clients apart. See docs/RATE_LIMITING.md."
        );
      } else {
        problems.push(
          "Neither TRUSTED_IP_HEADER nor TRUSTED_PROXY_HOPS is set. Without one of them every client looks the same to the rate limiter (one shared bucket) and per-client limits do nothing. Set TRUSTED_IP_HEADER (a header your edge overwrites, e.g. cf-connecting-ip) or TRUSTED_PROXY_HOPS (number of proxies appending to x-forwarded-for); only if the app is deliberately reachable with no proxy, set RATE_LIMIT_ALLOW_UNTRUSTED_CLIENT_IP=true. See docs/RATE_LIMITING.md."
        );
      }
    }
    if (!rawEnv.REDIS_URL) {
      if (parsed.RATE_LIMIT_ALLOW_MEMORY_STORE === "true") {
        // eslint-disable-next-line no-console
        console.warn(
          "[env] WARNING: RATE_LIMIT_ALLOW_MEMORY_STORE=true: rate limits (including the AI cost limit) are per instance and reset on restart. With more than one instance an attacker gets that many times the limit."
        );
      } else {
        problems.push(
          "REDIS_URL is not set. Rate limits would be per instance and reset on every restart (k instances = k times the limit, including the AI cost limit). Set REDIS_URL; only for a deliberate single-instance deployment, set RATE_LIMIT_ALLOW_MEMORY_STORE=true. See docs/RATE_LIMITING.md."
        );
      }
    }
    if (!rawEnv.CONTACT_INBOX_EMAIL) {
      // eslint-disable-next-line no-console
      console.warn(
        "[env] WARNING: CONTACT_INBOX_EMAIL not set in production. Contact-form submissions are accepted but nothing stores or delivers them (personal data is deliberately not logged). Set it before launch."
      );
    }
    if (!rawEnv.SENTRY_DSN) {
      // eslint-disable-next-line no-console
      console.warn(
        "[env] WARNING: SENTRY_DSN not set in production. Errors will only be logged locally, not reported to monitoring."
      );
    }
  }

  return problems;
}

/* -------------------------------------------------------------------------
 * Parse + fail fast
 * ---------------------------------------------------------------------- */

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    // Intentionally fatal. We do not want the app to boot in a
    // half-configured state — that is how "fake" functionality happens.
    throw new Error(
      `\n\n❌ Invalid environment configuration.\n\n${formatted}\n\n` +
        `Copy .env.example to .env and fill in real values. See docs/SETUP.md for where to obtain each key.\n`
    );
  }

  const conditionalProblems = validateConditionalRequirements(result.data, process.env);
  const fatalConditional = conditionalProblems.filter(
    () => result.data.NODE_ENV === "production"
  );

  if (fatalConditional.length > 0 && result.data.NODE_ENV === "production") {
    throw new Error(
      `\n\n❌ Environment configuration incomplete for production.\n\n` +
        conditionalProblems.map((p) => `  - ${p}`).join("\n") +
        `\n\nSee docs/SETUP.md.\n`
    );
  }

  if (conditionalProblems.length > 0 && result.data.NODE_ENV !== "production") {
    // In development, warn loudly but allow the app to boot so individual
    // modules can still be developed/tested in isolation.
    // eslint-disable-next-line no-console
    console.warn(
      `\n⚠️  [env] Configuration warnings (non-fatal outside production):\n` +
        conditionalProblems.map((p) => `  - ${p}`).join("\n") +
        `\n`
    );
  }

  return result.data;
}

export const env = loadEnv();

/* -------------------------------------------------------------------------
 * Derived helpers — small conveniences built on top of the validated env,
 * so call sites don't re-implement this logic.
 * ---------------------------------------------------------------------- */

export const isProduction = env.NODE_ENV === "production";
export const isDevelopment = env.NODE_ENV === "development";

/** True only if Razorpay is fully configured and able to process payments. */
export const isRazorpayConfigured = Boolean(
  env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET && env.RAZORPAY_WEBHOOK_SECRET
);

/** True only if Stripe is fully configured and able to process payments. */
export const isStripeConfigured = Boolean(
  env.STRIPE_SECRET_KEY && env.STRIPE_PUBLISHABLE_KEY && env.STRIPE_WEBHOOK_SECRET
);

/** True only if the currently selected default AI provider has a key set. */
export const isDefaultAIProviderConfigured = (() => {
  switch (env.AI_PROVIDER) {
    case "openai":
      return Boolean(env.OPENAI_API_KEY);
    case "anthropic":
      return Boolean(env.ANTHROPIC_API_KEY);
    case "gemini":
      return Boolean(env.GEMINI_API_KEY);
    case "grok":
      return Boolean(env.GROK_API_KEY);
    case "deepseek":
      return Boolean(env.DEEPSEEK_API_KEY);
  }
})();

export function isAIProviderKeyConfigured(provider: Env["AI_PROVIDER"]): boolean {
  switch (provider) {
    case "openai": return Boolean(env.OPENAI_API_KEY);
    case "anthropic": return Boolean(env.ANTHROPIC_API_KEY);
    case "gemini": return Boolean(env.GEMINI_API_KEY);
    case "grok": return Boolean(env.GROK_API_KEY);
    case "deepseek": return Boolean(env.DEEPSEEK_API_KEY);
  }
}

export const isRedisConfigured = Boolean(env.REDIS_URL);

/** True only if S3 storage is fully configured and able to accept uploads (Module 4 file assets). */
export const isS3Configured = Boolean(
  env.STORAGE_PROVIDER === "s3" &&
    env.S3_BUCKET_NAME &&
    env.S3_REGION &&
    env.S3_ACCESS_KEY_ID &&
    env.S3_SECRET_ACCESS_KEY
);
