# MarketMitra — Setup Guide

This guide takes you from a fresh `git clone` to a running local instance,
and explains exactly which external services must be configured before
each feature becomes functional.

## 1. Prerequisites

- Node.js 20+
- PostgreSQL 15+ (local, or a hosted provider like Neon/Supabase/RDS)
- A package manager: `npm`, `pnpm`, or `yarn`

## 2. Install

```bash
npm install
cp .env.example .env
```

Open `.env` and fill in real values. **The app will refuse to start if
required variables are missing** — `src/lib/env.ts` validates everything
at boot and tells you exactly what's wrong.

## 3. Database

```bash
npm run db:migrate      # creates tables from prisma/schema.prisma
npm run db:generate     # regenerates the Prisma client (also runs on install)
```

Optional: `npm run db:studio` opens Prisma Studio, a GUI for browsing your
local database.

## 4. Minimum config to boot in development

At minimum, set:

```
DATABASE_URL=...
DIRECT_URL=...
SESSION_SECRET=...        # openssl rand -base64 32
AI_PROVIDER=anthropic     # or your provider of choice
ANTHROPIC_API_KEY=...     # matching key for whichever AI_PROVIDER you chose
```

With just these set, `npm run dev` will boot and auth + AI generation will
work. Other features will be visibly disabled/return clear errors until
configured (see table below) — they will never silently fake success.

## 5. Feature → required configuration

| Feature | Required env vars | Where to get them |
|---|---|---|
| Auth, sessions, workspaces, RBAC | `DATABASE_URL`, `SESSION_SECRET` | Generate locally |
| Email verification, password reset | `RESEND_API_KEY` (or `SMTP_*`) | resend.com → API Keys |
| AI content generation | `AI_PROVIDER` + matching `*_API_KEY` | See table below |
| Logo / brand asset uploads | `S3_BUCKET_NAME`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | AWS Console → S3 + IAM |
| India payments | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | dashboard.razorpay.com → Settings → API Keys / Webhooks |
| International payments | `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` | dashboard.stripe.com → Developers |
| Rate limiting | `REDIS_URL` | Upstash, Redis Cloud, or self-hosted |
| Error monitoring | `SENTRY_DSN` | sentry.io → Project Settings |

### AI provider keys

| Provider | Env var | Where to get it |
|---|---|---|
| OpenAI | `OPENAI_API_KEY` | platform.openai.com/api-keys |
| Anthropic | `ANTHROPIC_API_KEY` | console.anthropic.com/settings/keys |
| Gemini | `GEMINI_API_KEY` | aistudio.google.com/apikey |
| Grok | `GROK_API_KEY` | console.x.ai |
| DeepSeek | `DEEPSEEK_API_KEY` | platform.deepseek.com |

You only need a key for the provider(s) you intend to use. The default
provider (`AI_PROVIDER` in `.env`) must have its matching key set, or the
app will refuse to start in production (it will warn, not block, in
development, so you can work on unrelated modules without every key set).

## 6. Webhooks — required for billing to function

Razorpay and Stripe both call your server when a payment event happens
(success, failure, refund, subscription renewal). In local development,
your server isn't reachable from the internet, so you need a tunnel:

```bash
# Using the Stripe CLI (also forwards Razorpay-shaped payloads via a generic tunnel)
stripe listen --forward-to localhost:3000/api/webhooks/stripe

# Or a generic tunnel for both:
ngrok http 3000
```

Then register the resulting public URL in each dashboard:

- **Razorpay** → Settings → Webhooks → Add a webhook
  URL: `https://<your-tunnel>/api/webhooks/razorpay`
  Events: `payment.captured`, `payment.failed`, `subscription.activated`,
  `subscription.cancelled`, `subscription.charged`
- **Stripe** → Developers → Webhooks → Add endpoint
  URL: `https://<your-tunnel>/api/webhooks/stripe`
  Events: `checkout.session.completed`, `invoice.paid`,
  `invoice.payment_failed`, `customer.subscription.updated`,
  `customer.subscription.deleted`

Copy the webhook signing secret each dashboard gives you into
`RAZORPAY_WEBHOOK_SECRET` / `STRIPE_WEBHOOK_SECRET`. Webhook signature
verification is mandatory in the handler code — requests with an invalid
signature are rejected, not processed.

In production, point these at your real domain instead of a tunnel.

## 7. Running

```bash
npm run dev          # http://localhost:3000
```

## 8. Production deployment notes

- Run `npm run db:migrate:deploy` (not `db:migrate`) in CI/CD — it applies
  existing migrations without prompting, and never auto-generates new ones
  against a production database.
- Set `NODE_ENV=production`. With this set, `src/lib/env.ts` becomes
  stricter: missing billing keys or `SENTRY_DSN` produce warnings, but a
  missing `DATABASE_URL`, `SESSION_SECRET`, or the active `AI_PROVIDER`'s
  key will prevent boot entirely.
- `DIRECT_URL` must point to a non-pooled connection if your Postgres
  provider pools connections (Neon, Supabase, PgBouncer) — Prisma
  migrations require a direct connection.

## 9. What this repository does not include

- A running PostgreSQL instance, AI provider account, or payment gateway
  account — you must create these yourself.
- Real email sending without a configured `RESEND_API_KEY` (or SMTP
  credentials) — until then, verification/reset emails will fail to send
  and the relevant API routes will return a clear `PROVIDER_ERROR`, not a
  silent fake success.
- A CI/CD pipeline — `package.json` scripts are provided as the building
  blocks for one (GitHub Actions, etc.), but no workflow file is included
  in Module 1.
