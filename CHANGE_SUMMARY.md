# MarketMitra — Marketing Site Integration: Change Summary

Scope: integrate the existing dark/AI-sphere landing page into the real
`marketmitra-app` Next.js codebase (Modules 1–3), on real auth, real
routing, and honest content — no fabricated claims, no simulated
functionality presented as real.

---

## 1. Files created

### Marketing route group (`src/app/(marketing)/`)
| File | Purpose |
|---|---|
| `layout.tsx` | Resolves session once, mounts Nav/Footer/ambient effects, dark-by-default theme scope, base OG/Twitter metadata |
| `page.tsx` | Homepage — Hero, Problem, Features, Testimonials (empty state), Demo teaser, Pricing teaser, FAQ, Final CTA + Organization/FAQ JSON-LD |
| `features/page.tsx` | Dedicated features page |
| `pricing/page.tsx` | Dedicated pricing page (full plan comparison + FAQ) |
| `demo/page.tsx` + `demo/_components/demo-client.tsx` | Real interactive AI demo form — real validation, real API call, honest "product preview" result state |
| `privacy/page.tsx`, `terms/page.tsx`, `refund-policy/page.tsx` | Real legal routes with structured, reviewable content (bracketed placeholders only for company-specific identifiers that don't exist yet — nothing fabricated) |
| `contact/page.tsx` + `contact/_components/contact-form.tsx` | Real contact form, wired to a working backend |
| `help/page.tsx` | Help centre index — honest structure, no fake articles |
| `_3d/ai-core.tsx` | React Three Fiber AI core scene (client-only, dynamic-imported) |

### Reusable marketing components (`src/components/marketing/`)
`nav.tsx`, `footer.tsx`, `hero.tsx`, `ai-core-visual.tsx`, `ai-core-fallback.tsx`, `particle-background.tsx`, `cursor-glow.tsx`, `problem-section.tsx`, `feature-bento.tsx`, `testimonials-section.tsx`, `demo-preview-teaser.tsx`, `pricing-section.tsx`, `faq.tsx`, `final-cta.tsx`, `cta-link.tsx`, `analytics-provider.tsx`

### Architecture / integration points
| File | Purpose |
|---|---|
| `src/lib/marketing-cta.ts` | Single source of truth: logged-out → `/signup`, logged-in → `/dashboard` |
| `src/lib/pricing-data.ts` | Typed pricing data shaped to mirror the `Plan` Prisma model, documented swap point for Module 8 |
| `src/lib/analytics/events.ts`, `track.ts` | Typed, provider-agnostic analytics event catalogue + dispatcher (no-ops until a provider is chosen) |
| `src/modules/ai/demo-contract.ts` | Shared request/response contract for the future AI Provider Layer (Module 5) |
| `src/app/api/v1/ai/demo-generate/route.ts` | Real validation, honest `FEATURE_NOT_AVAILABLE` response until Module 5 exists |
| `src/app/api/v1/contact/route.ts` | Real, working contact endpoint (logs submissions; emails them once `CONTACT_INBOX_EMAIL` is set) |
| `src/app/dashboard/page.tsx` | Resolves a logged-in "go to dashboard" CTA to the user's actual workspace |
| `src/app/robots.ts`, `src/app/sitemap.ts` | Real robots/sitemap covering every public route |
| `.eslintrc.json` | **Pre-existing gap, not created by this task's scope but fixed anyway**: `package.json` already declared `eslint`/`eslint-config-next` but no config file existed, so `npm run lint` didn't run at all. Added the standard Next.js config so linting is actually functional repo-wide. |

---

## 2. Files modified (outside the new marketing module)

| File | Change | Why |
|---|---|---|
| `src/app/layout.tsx` | Removed "India's First AI Marketing Employee" from default/OG/Twitter titles → "AI Marketing Employee for Small Businesses" | Unverified superiority claim, called out by name in the audit requirement |
| `src/app/manifest.ts` | Same fix in the PWA manifest description | Same claim, shown on "Add to Home Screen" |
| `src/app/(auth)/signup/page.tsx` | "India's first AI Marketing Employee" → "your AI Marketing Employee" | Same claim, on the actual signup page |
| `src/lib/email.ts` | Removed "India's First AI Marketing Employee" and the fabricated "MarketMitra Technologies Pvt. Ltd." from the shared transactional email template | Same unverified claim + a fabricated company legal name, sent to every user in every transactional email |
| `src/lib/env.ts` | Added one **optional** field: `CONTACT_INBOX_EMAIL` | Needed for the real contact form to actually deliver mail via the existing `sendEmail()` adapter. Additive only — no existing required config changed. |
| `.env.example` | Documented `CONTACT_INBOX_EMAIL` | Keeps env docs in sync with `env.ts` |
| `package.json` | Added `three`, `@react-three/fiber` (React 19–compatible), `@types/three` | Required for the AI core 3D scene |

These five content fixes were outside the marketing route group but are the exact issue the audit requirement named explicitly ("India's First" as a legally risky, unverified claim) — they were left in Module 1/3's stable files and would otherwise still ship on every page, every email, and the app manifest.

---

## 3. What's real vs. what's an honest placeholder

**Fully real and working today:**
- Every nav link, footer link, and CTA resolves to a real route — no dead `#` links.
- Logged-out/logged-in CTA branching uses the real session (`getCurrentSession()` from Module 3), not a mock.
- The `/dashboard` CTA target actually queries the user's real workspace membership and redirects there.
- The contact form validates input for real and either emails it (if `CONTACT_INBOX_EMAIL` is set) or logs it — nothing is silently dropped.
- The AI demo form validates input for real and calls a real API route.
- Pricing toggle, FAQ accordion, mobile nav, 3D core, particle background, and cursor glow are all functioning interactive UI, not decoration.

**Honest, clearly-labeled placeholders (not fake data presented as real):**
- The AI demo returns a typed `FEATURE_NOT_AVAILABLE` response and shows one static example labeled "Illustrative example — not generated from your input." It never claims to be live AI output.
- Testimonials section renders an honest empty state ("We're just getting started") — the typed `Testimonial` architecture is built and ready, but contains zero fabricated entries.
- Legal pages have real structure but bracket company-specific identifiers (`[Company Legal Name]`, `[Grievance Officer Name]`, etc.) that don't exist yet — nothing is invented.
- Pricing numbers (₹999 / ₹2,499 / ₹7,999) are kept from the original design as the product's actual intended list prices — this is a business decision, not a fabricated performance/usage statistic, so it didn't need removing.

**Removed entirely (per the audit):**
- Fake animated stat counters ("10,000+ businesses", "40+ hours saved/month", "95% satisfaction").
- Fabricated mini-charts asserting specific unverified outcomes (SEO score, competitor comparison bars, engagement growth).
- Three fictional testimonials with invented names/roles/photos.
- Fake GSTIN/CIN in the footer.
- "India's First" superiority claim, everywhere it appeared in the codebase (see §2).
- The unverified "SOC 2 compliant" / "AES-256" security claim in the FAQ — replaced with an accurate description of what's actually implemented (bcrypt password hashing, signed-JWT sessions in HttpOnly cookies).

---

## 4. Environment variables

New (optional, additive):
- `CONTACT_INBOX_EMAIL` — destination inbox for the /contact form. Until set, submissions are captured via structured logging only.

No existing required environment variable was changed.

---

## 5. Integrations intentionally deferred

- **Module 5 (AI Provider Layer):** `src/modules/ai/demo-contract.ts` and `src/app/api/v1/ai/demo-generate/route.ts` define and validate the full contract; the actual model call is not implemented. Swap-in point documented in both files.
- **Module 8 (Billing):** `src/lib/pricing-data.ts` is a static, typed stand-in for a future `billingService.listActivePlans()`. Razorpay/Stripe, coupons, and real subscription state are not implemented; the documented gateway rule (Razorpay for India, Stripe elsewhere) is recorded but not wired.
- **Workspace onboarding:** `src/app/dashboard/page.tsx` resolves an existing workspace but has no workspace-*creation* flow to redirect new users into (that flow doesn't exist in Modules 1–3 yet) — it shows an honest interim state instead of a broken redirect.

---

## 6. Validation performed

- `npx tsc --noEmit`: zero new errors. All remaining errors are pre-existing and unrelated to this work (see §7).
- `npx eslint` (after adding the missing `.eslintrc.json`): zero errors across every new/modified file, after one fix (an unused-expression pattern in the 3D scene).
- Manual audit of every Tailwind/CSS class used in new components against `tailwind.config.ts` and `tokens.css` — no invented colors or ad hoc values; everything resolves through the existing design tokens.
- Full `npm run build` (`prisma generate && next build`) could **not** be completed in this sandbox: `prisma generate` needs to download its query-engine binary from `binaries.prisma.sh`, which isn't on this environment's network allowlist (confirmed via direct test, including with `PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1`). This is a sandbox limitation, not a code issue — recommend running `npm run build` in your actual dev/CI environment before deploying, since that exercises Next.js's own type-check and route-generation pass that I couldn't fully replicate here.

## 7. Pre-existing issues — NOT introduced by this work

Confirmed present in the baseline before any of my changes (via `tsc --noEmit` on the untouched Module 3 zip):
- `src/app/(auth)/signup/_components/signup-form.tsx`, `src/components/layout/sidebar.tsx`, `src/components/notifications/notification-center.tsx`, `src/components/ui/search-input.tsx`, `src/hooks/use-autosave.ts` — pre-existing type errors, mostly downstream of Prisma Client types not being generated in this sandbox.
- `src/lib/email.ts` — missing `nodemailer` type declarations (unrelated to the copy edits I made); also has one pre-existing unused import (`isProduction`).
- `src/components/layout/theme-provider.tsx` — a `next-themes` type-resolution issue.
- `npm audit` reports 51 vulnerabilities (2 critical, 4 high) across pre-existing dependencies (notably `@sentry/nextjs`'s transitive deps and `rollup`) — none introduced by the two packages I added (`three`, `@react-three/fiber`). Worth a deliberate `npm audit fix` pass, but out of scope for a marketing-page integration.

---

## 8. Not proceeding to Module 5

Per the brief, stopping here for review. Ready to continue into the AI Provider Layer (Module 5) or Billing (Module 8) once approved.
