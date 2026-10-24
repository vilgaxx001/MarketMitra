# MarketMitra — Architecture

This document explains how the codebase is organized and why, so future
contributors (human or AI) extend it consistently rather than re-deriving
conventions from scratch.

## 1. High-level shape

```
src/
├── app/          Next.js routes — pages, layouts, API endpoints. THIN.
├── modules/      Domain logic — services, repositories, validators. THICK.
├── components/   Reusable UI — design system + shared patterns.
├── lib/          Framework-level infrastructure — db, env, logging, etc.
├── hooks/        Reusable client-side React hooks.
└── types/        Shared TypeScript types not owned by a single module.
```

**The core rule: `app/` calls `modules/`, never the reverse, and `modules/`
never imports from `app/`.**

A page or API route's job is to: authenticate the request, parse/validate
input, call a module's service function, and shape the response. All
business logic — RBAC checks, Prisma queries, AI provider calls, billing
calculations — lives in `modules/`. This is what makes the roadmap items in
requirement #16 (Public API, Chrome Extension, Mobile App) additive rather
than a rewrite: they are new callers of the same `modules/*/service.ts`
functions that the web app already uses.

## 2. Module anatomy

Every folder under `src/modules/<name>/` follows the same internal shape:

```
modules/<name>/
├── service.ts        Business logic. Exported functions are the module's
│                      public API. This is what app/ and other modules call.
├── repository.ts      All Prisma queries for this module's models live
│                      here, and ONLY here. Nothing outside repository.ts
│                      talks to `db.<model>` for this domain.
├── validators.ts       Zod schemas — the single source of truth, reused by
│                      both React Hook Form (client) and API routes (server).
├── types.ts            TypeScript types specific to this module.
└── errors.ts (opt.)    Module-specific ApiException factories.
```

**Why repository.ts is isolated:** workspace isolation (a core requirement)
is enforced by convention at this layer — every repository function that
touches a tenant-owned table requires a `workspaceId` parameter and applies
it to the Prisma `where` clause. Centralizing this means there is exactly
one place per module where a missing `workspaceId` filter could leak data
across tenants, making it easy to audit.

## 3. Why Next.js App Router + Server Components by default

Pages are Server Components unless they need interactivity (forms, the
command palette, charts, anything with `useState`/`useEffect`), per
requirement #10. This means:

- Initial page loads ship less JavaScript — better Core Web Vitals, which
  matters for both the public marketing site's SEO (#18) and dashboard
  perceived performance.
- Data fetching for a page (e.g. "this workspace's projects") happens
  directly in the Server Component via a module's service function — no
  client-side loading spinner for data that's known at request time.
- `'use client'` is pushed to the smallest possible leaf component. A
  dashboard page itself stays a Server Component; only the interactive
  chart inside it is a Client Component.

## 4. RBAC model

See `docs/RBAC.md` for the full permission matrix. Summary: `PlatformRole`
(`SUPER_ADMIN` | `USER`) lives on `User` directly and is independent of any
workspace — it exists only to gate `/admin`. Real day-to-day permissions
come from `WorkspaceRole` (`ADMIN` | `TEAM_MEMBER` | `CLIENT`) on the
`WorkspaceMember` join row, meaning one user can be an `ADMIN` in their own
workspace and a `CLIENT` in another they were invited to view.

`src/modules/rbac/guard.ts` exposes a single `can(user, action, resource)`
function used in three places identically:
1. `middleware.ts` — route-level redirect before a page even renders.
2. Server Components — conditionally render UI (e.g. hide the "Billing" nav
   item from a `CLIENT`).
3. API routes — the actual authorization check before mutating data.

Centralizing this in one function (rather than re-deriving role checks in
each route) is what prevents the common SaaS bug where the UI hides a
button but the API still allows the action if called directly.

## 5. AI Provider Layer

See `src/modules/ai/providers/provider.interface.ts`. Every provider
(OpenAI, Anthropic, Gemini, Grok, DeepSeek) implements the same
`AIProvider` interface. `provider.factory.ts` resolves which implementation
to use based on (in priority order): an explicit override passed by the
caller → the workspace's `preferredAIProvider` column → the platform
default (`env.AI_PROVIDER`). `generation.service.ts`, and everything that
calls it, only ever depends on the interface — never a concrete provider
SDK. Adding a 6th provider later is exactly one new file implementing
`AIProvider` plus one line in the factory's switch statement; zero changes
anywhere else in the codebase. The same interface shape is the intended
pattern for the future `ImageProvider`/`VideoProvider`/`VoiceProvider`
modules in the roadmap.

## 6. Billing architecture

`Subscription`, `Invoice`, and `PaymentAttempt` are gateway-agnostic tables
(see `prisma/schema.prisma` header comments). A `BillingGateway` enum
(`RAZORPAY` | `STRIPE`) plus gateway-specific ID columns means
`requireFeature`/`usageLimit` middleware and all UI never need a
gateway-specific branch — they read `Subscription.status` and
`Plan.features`/`Plan.maxGenerationsPerMonth` regardless of which processor
is in use. Razorpay is used for Indian customers, Stripe for international,
selected at checkout time based on the workspace's billing country.

Subscription state is **only** ever mutated from a verified webhook
handler, never optimistically from a client-side "payment succeeded"
redirect — the `WebhookEvent` table provides idempotency so gateway retries
can't double-process a payment.

## 7. Error handling contract

Every API route returns the envelope defined in `src/lib/api-response.ts`:
`{ data }` on success, `{ error: { code, message, details? } }` on failure,
with a stable `code` the frontend can branch on. Route handlers throw
`ApiException` for expected failures (validation, permission, plan limits)
and let `withApiHandler` catch-and-shape unexpected ones, so no route
reimplements try/catch boilerplate.

Every data-fetching UI unit (a dashboard widget, a list, a form submit) is
expected to model and render four states explicitly — loading, error,
empty, success — via the shared `<AsyncBoundary>` pattern component
introduced in Module 7, rather than each feature inventing its own
spinner/error markup.

## 8. What's deliberately NOT in this repo

This codebase assumes a real PostgreSQL database, real third-party API
keys (AI providers, Razorpay/Stripe, Resend, S3), and a real Node.js
server/hosting environment to run. It is not designed to run inside a
sandboxed chat artifact. See `docs/SETUP.md` for what's required to take
it from `git clone` to a running production deployment, including exactly
which environment variables are required before which features become
functional.

## Identity and session validity (Pre-5C security remediation)
**Identity comes from exactly one place: the signed session cookie, confirmed against the database. No request header is ever identity.**

- `requireAuth()` (`src/lib/middleware/require-auth.ts`) reads the session cookie, verifies the JWT (HS256, issuer, audience, expiry), then runs ONE query joining the `sessions` row to its `users` row (`findActiveSessionIdentity`): the row must exist, belong to the JWT's `userId`, be unexpired, and the user must be `isActive`. The returned `platformRole` and `email` are the **database's** values, not the token's, so a demotion/promotion/deactivation takes effect on the next request instead of at JWT expiry. `requireAuthUser` and `requireWorkspaceAccess` (including the SUPER_ADMIN cross-workspace bypass) are built on it. Logout, password change and password reset delete the session row(s), which revokes copied tokens immediately.
- **Why:** an earlier design had the edge middleware inject `x-user-id`, `x-session-id`, `x-user-email`, `x-platform-role` and `requireAuth` trust them. Middleware overwrote them only for requests carrying a valid cookie; with no cookie or an invalid/expired/tampered one it forwarded the client's own copies untouched, so a client could name its own platform role (SUPER_ADMIN) and, with its own valid session ids, pass the session-row check. Those headers are no longer read anywhere and the middleware deletes them from every forwarded request (`src/lib/middleware/identity-headers.ts`) as defense in depth. Do not reintroduce a header-based identity channel; the regression tests (`src/lib/middleware/__tests__/*`, the identity-header section of `scripts/http-verification/run.mjs`) fail if you do.
- Middleware still verifies the JWT, but only for coarse redirects (protected pages -> /login, `/admin` guard). That result can be stale and never authorises data access; any future `/admin` handler must call `requireAuth()` and check its DB role. Redirecting signed-in users away from `/login` etc. lives in `src/app/(auth)/layout.tsx` (it needs the database; doing it in middleware looped for revoked-but-unexpired tokens).
- `requireWorkspaceAccess` returns the caller's OWN identity for the SUPER_ADMIN cross-workspace bypass (workspace role ADMIN-equivalent). Callers use `.id` as the actor for audit logs, `createdBy`/`updatedBy` columns and membership operations; an earlier version returned the workspace owner there, which attributed SUPER_ADMIN actions to the owner and let `POST /leave` remove the owner's membership.
- `getCurrentSession()` is the bare-JWT reader (marketing CTAs, `logout`); it is not an authorization check.
- Cost: one primary-key join per authenticated request (previously a header read plus one lookup).
