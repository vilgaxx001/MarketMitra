# Module 4 — Workspace & Organization System: Delivery Report

## 1. Completion summary

Module 4 is implemented end-to-end: schema, RBAC integration, service/repository
layers for workspace, multi-business, brand identity, target audience, team
invitations, and file assets; a Business Context Engine; activity logging;
plan-limit enforcement; a 9-step onboarding flow; and the authenticated app
shell (which didn't exist before this pass — see §9).

**Important, load-bearing correction to the brief's assumed starting state:**
the brief describes several things as "existing architecture — do not
rebuild": a `Business` model, `FileAsset`/`FileAssetVersion` with S3
presigned uploads and SHA-256 dedup, and a universal `ActivityLog`. A full
audit of the actual repository (done before writing any code — see the
conversation record) found:
- `BusinessProfile` existed but was **1:1 with Workspace** (`workspaceId @unique`)
  — structurally incompatible with multi-business. This pass removed that
  constraint and added the lifecycle/profile fields, since real multi-business
  functionality was impossible without it.
- `FileAsset`/`FileAssetVersion` and any S3 upload code **did not exist** —
  only the S3 environment variables were pre-wired (`env.ts`) and the AWS SDK
  packages were installed but never imported anywhere. This pass built the
  real thing.
- No `ActivityLog` model existed — the existing `AuditLog` model is
  functionally identical, so it's reused rather than duplicated.

This is disclosed prominently because "Do not rebuild Modules 1-3" assumes
Module 4's prerequisites were already built; where they genuinely weren't,
building them for real (not faking them) was the only way to deliver a real
system. Nothing that *did* already exist (RBAC, `requireWorkspaceAccess`,
`TeamInvite`, the email template system, the design system) was rebuilt —
see §3 for what was reused as-is.

---

## 2. Files created (104)

Grouped by area — full paths in the delivered zip.

**Schema/docs:** `docs/WORKSPACE_AND_BUSINESS.md`

**Domain modules** (`src/modules/`, each with `types.ts` / `validators.ts` /
`repository.ts` / `service.ts` / `index.ts` per `docs/ARCHITECTURE.md`'s
convention): `workspace/`, `business/` (+ `completion-score.ts`), `brand/`,
`audience/`, `team/`, `assets/` (+ `storage.ts`, `mime-sniff.ts`,
`scan-contract.ts`), `activity/`, `context/`, `onboarding/`.

**Shared contract:** `src/types/business-context.ts` (the Module 5 integration
type — see §11).

**Security/middleware:** `src/lib/middleware/require-business.ts` (active-business
resolver).

**API routes** (30, all under `src/app/api/v1/`): workspace CRUD + archive/
restore/leave; business CRUD + archive/restore/switch-active; brand GET/PATCH;
audience CRUD + set-primary; team members/invites (+ resend/revoke/accept);
assets (initiate-upload/confirm-upload/list/archive); business context;
activity query; onboarding (start/state/step/complete).

**UI — authenticated app shell** (didn't exist before this pass):
`(app)/[workspaceSlug]/layout.tsx`, `dashboard/page.tsx`, `businesses/*`
(list, new, detail with 4 tabs), `team/*`, `settings/*`, `activity/page.tsx`,
`onboarding/*` (wizard + 7 step components + shared step hook).

**UI — standalone:** `src/app/onboarding/*` (step 1 — workspace creation),
`src/app/invite/[token]/*` (invitation acceptance).

**Shared components:** `src/components/workspace/{workspace,business}-switcher.tsx`,
`src/components/ui/tag-input.tsx` (new reusable primitive for `string[]` fields).

## 3. Files modified (12)

| File | Change | Why |
|---|---|---|
| `prisma/schema.prisma` | See §4 | Core Module 4 schema work |
| `src/modules/rbac/permissions.ts` | Added Module 4 `Action`s to the existing matrix; removed the one unused legacy permission | Extends, doesn't replace, Module 3's RBAC |
| `src/lib/api-response.ts` | `withApiHandler` now optionally accepts Next's dynamic-route `{ params }` context (generic, backward compatible) | Every workspace/business-scoped route needs `[workspaceSlug]`/`[businessId]` — the existing helper only supported zero-arg handlers |
| `src/lib/env.ts` | Added `isS3Configured` flag (mirrors the existing `isDefaultAIProviderConfigured` pattern) | Lets the assets module report an honest "storage not configured" state instead of crashing |
| `src/middleware.ts` | Added `/onboarding`, `/invite` to protected prefixes; added `businesses\|onboarding\|activity` to the workspace-scoped route pattern | New Module 4 routes need the same edge-level auth guard as `dashboard`/`team`/`settings` already had |
| `src/app/(auth)/forgot-password/page.tsx`, `login/page.tsx`, `signup/page.tsx`, `login/_components/login-form.tsx` | `<a href="/...">` → `<Link href="/...">` | Real, pre-existing lint errors (`@next/next/no-html-link-for-pages`) surfaced by this pass's full lint run — fixed, not just noted |
| `src/app/(marketing)/privacy/page.tsx`, `refund-policy/page.tsx`, `terms/page.tsx` | Same `<a>` → `<Link>` fix | Same reason, found in the same lint run |

## 4. Prisma schema changes

- **`Plan`**: added `maxBusinesses Int @default(1)`.
- **`BusinessProfile`**: removed `workspaceId @unique` (→ `@@unique([workspaceId, slug])`);
  added `slug`, `category`, `businessType`, `country`/`state`/`city`/`timeZone`/
  `preferredLanguage`/`currency`, `targetMarket`, `businessGoals[]`,
  `primaryOfferings[]`, `usp`, `marketingChallenges[]`, `competitors[]`,
  `socialLinks (Json)`, `isActive`/`archivedAt`, `createdById`. Removed
  `logoUrl`/`brandColors`/`brandVoice` (superseded by `BrandIdentity`; confirmed
  unused anywhere in `src/` before removal).
- **`BrandIdentity`** (new): 1:1 with `BusinessProfile`, typed fields per the
  brief's list (`String[]` for word/value lists, not JSON blobs).
- **`AudienceSegment`** (new): many per business, `isPrimary` flag.
- **`FileAsset`** / **`FileAssetVersion`** (new): the S3-backed, versioned,
  SHA-256-deduplicated asset system — see `docs/WORKSPACE_AND_BUSINESS.md` §10.
- **`Workspace`**: `businessProfile BusinessProfile?` (1:1) → `businesses BusinessProfile[]`
  (1:many); added `fileAssets FileAsset[]`, `onboardingStep Int @default(0)`,
  `onboardingCompletedAt DateTime?`.
- **`User`**: added reverse relations for the new FKs (`createdBusinesses`,
  `createdAudienceSegments`, `uploadedFileVersions`).
- **New enums**: `BusinessType`, `FileAssetCategory`, `FileScanStatus`.

## 5. Database migrations required

**None have been generated or applied.** `npx prisma migrate dev` needs
Prisma's query-engine binary, which this sandbox cannot download (see §7) —
generating a migration without the ability to verify it against a real
database would risk shipping an unverified `.sql` file, which is worse than
not shipping one. **Run in your real environment before deploying:**
```
npx prisma generate
npx prisma migrate dev --name module_4_workspace_business_system
```
Review the generated SQL before applying to any environment with existing
data — the `BusinessProfile` unique-constraint change and column removals
(`logoUrl`/`brandColors`/`brandVoice`) are the parts most likely to need a
manual data-backfill step if any pre-Module-4 rows exist in a real database
(unlikely, since the authenticated app was entirely unbuilt, but worth
confirming).

## 6. Environment variables required

No new variables were introduced. Module 4 uses env vars already declared in
`src/lib/env.ts` (confirmed pre-wired, not built by this pass):
`STORAGE_PROVIDER`, `S3_BUCKET_NAME`, `S3_REGION`, `S3_ACCESS_KEY_ID`,
`S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_URL` (file uploads — without these set,
`isS3Configured` is `false` and upload attempts return a typed
`FEATURE_NOT_AVAILABLE` error rather than crashing), plus the existing
`EMAIL_PROVIDER`/`RESEND_API_KEY`/SMTP vars (invitation emails) and
`APP_URL` (invite links).

## 7. Validation results

| Check | Result |
|---|---|
| `npx tsc --noEmit` | **55 errors, all attributable to one root cause**: Prisma Client can't be generated in this sandbox (see below), so every `@prisma/client` type import fails, cascading into "implicit any" on anything typed from a Prisma query result. Confirmed by category: 27× "no exported member" from `@prisma/client`, 10× "Namespace has no exported member" (same cause), 3× pre-existing `db.ts` `@ts-expect-error` (documented in the Stabilization Report, not touched here), 15× implicit-any (all inside `.map()`/transaction callbacks over Prisma query results). **Zero errors outside this pattern** across all 104 new + 12 modified files. |
| `npx eslint . --ext .ts,.tsx` | **Clean.** 0 errors, 0 warnings, full repo — including 9 real, pre-existing errors found and fixed during this pass (see §3). |
| `npx prisma validate` / `npx prisma generate` | **Blocked** — both need `binaries.prisma.sh`, not reachable from this sandbox (confirmed via direct `curl`-equivalent test with `PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1`, same as the Stabilization Report's finding). Not a code issue — the schema was manually proofread in full (relation cardinality, cascade paths, index coverage) but needs real `prisma validate` in an environment with network access before merging. |
| `npm run build` (`prisma generate && next build`) | Blocked at the same point. Running `next build` directly (bypassing `prisma generate`, dummy env values): **webpack compilation completes with zero errors** across every new route/page/component, failing only at `next/font`'s Google Fonts fetch (`fonts.googleapis.com`, also not reachable here) — reproduced twice, identical failure point both times. Strong signal the code compiles cleanly. |
| Tenant isolation / IDOR | Every business-scoped repository function takes `workspaceId` and filters by it in the same query (`findByIdInWorkspace`, `findFirst({ where: { id, workspaceId } })`) rather than fetch-then-check. `requireBusinessAccess()` re-verifies business→workspace ownership before every business-scoped operation, including the "switch active business" cookie (a tampered cookie value falls through to "no valid business," never cross-tenant data). |
| RBAC enforcement | Every one of the 30 API routes calls `requirePermission()` before touching data; every settings/team page gates its mutation controls with `can()`. Verified by grep — no route mutates data before its permission check. |
| Business limit enforcement | `createBusiness`/`restoreBusiness` both check `getBusinessLimit()` before writing; over-limit returns `PLAN_LIMIT_REACHED` (existing typed error code) with no row created. |
| Invitation lifecycle | State machine enforced in `team/service.ts` (§8 of the architecture doc); tokens hashed, single-use (status flips on accept), invalid after revoke/expiry. |
| File ownership | Every asset query scoped by `workspaceId`; MIME type re-verified server-side from actual bytes, never trusted from the client. |
| Primary audience consistency | Enforced via transaction (`repository.ts::setPrimary`), not a DB constraint — documented reasoning in the architecture doc. |
| Responsive layouts / accessibility | Built entirely on the existing Module 2 design system (Radix-based primitives, already accessible; Tailwind responsive utilities used throughout). **Not independently re-verified on physical devices or with a screen reader in this pass** — flagging as an honest gap rather than claiming a full audit that didn't happen. |
| Placeholder code / TODO markers / mock data / fake success flows / hardcoded secrets / suppressed type errors | Scanned via grep across every new file — **zero matches** for `TODO`/`FIXME`/`HACK`, `any`/`@ts-ignore`/`@ts-expect-error`, and common secret patterns. |

## 8. Security review results

- **Cross-workspace access**: not possible through the API — every route
  resolves `workspaceId` from `requireWorkspaceAccess(workspaceSlug)` (server
  session + DB membership check), never from a client-supplied field.
- **Cross-business access**: `requireBusinessAccess()` re-checks
  `business.workspaceId === workspaceUser.workspaceId` on every business-scoped
  read/write — a `businessId` for a different workspace returns `NOT_FOUND`,
  not the other workspace's data.
- **Invitation token leakage**: tokens are never stored in plaintext
  (SHA-256 hash only, matching the existing auth-token pattern) and never
  echoed back in any API response.
- **Mass assignment**: every `update*` service function maps input fields
  explicitly (`...(input.x !== undefined && { x: input.x })`) — client
  payloads are never spread directly into a Prisma `update`/`create` call.
- **File upload abuse**: category-scoped MIME/size allowlists enforced
  server-side; real magic-byte verification against the uploaded bytes
  (not the client's claimed `Content-Type`) before a version is persisted;
  presigned URLs are short-lived (5–15 min) and scoped to one object; AWS
  credentials never reach the client.
- **Archived-entity access**: archived workspaces/businesses/audience segments
  are excluded from default list queries and from `resolveActiveBusiness()`'s
  fallback; the Business Context Engine explicitly checks `isActive` before
  returning context for a business.
- **One bug found and fixed during this review**: Zod schemas using
  `.array(...).default([])` produce a *required* (never-undefined) field in
  the parsed output type — meaning a partial `PATCH` that omitted an array
  field (e.g. `businessGoals`) would have silently wiped it to `[]` instead
  of leaving it untouched. Fixed by removing the defaults from all three
  affected validator files (`business`, `brand`, `audience`) before this was
  ever exercised by real traffic — see the conversation record for the full
  root-cause trace.

## 9. Deferred integrations

- **Module 5** (AI Core/Memory/RAG/Chat/Agents): the Business Context Engine
  (`src/modules/context/service.ts`) is the complete, ready integration
  point — see §11. No AI provider code exists anywhere in this pass.
- **Module 8** (real billing): `getBusinessLimit()`'s fallback constant
  (`DEFAULT_MAX_BUSINESSES_NO_SUBSCRIPTION = 1`) is exercised for every
  workspace today, since no workspace has a real `Subscription` row yet.
  Swap point is documented inline in `business/service.ts`.
- **Module 9** (Admin UI): `activity/service.ts::queryActivity()` is the
  complete query contract; no admin panel UI was built.
- **Malware scanning**: real integration point exists
  (`assets/scan-contract.ts`), unconnected — every upload resolves to
  `SKIPPED`, never a fabricated `CLEAN`.
- **Authenticated app shell beyond Module 4's own pages**: `projects/`,
  `generate/`, `analytics/`, `billing/`, `calendar/` route directories
  remain the empty placeholders they were before this pass — building real
  pages there belongs to the modules that own that functionality.

## 10. Known limitations

- Prisma Client generation, `prisma validate`, and a full `next build` could
  not be completed in this sandbox — both blocked by network restrictions
  (`binaries.prisma.sh`, `fonts.googleapis.com`), not code issues. Run the
  exact commands in §7 in a real environment before merging.
- No database migration has been generated or applied (§5) — by design,
  given the above.
- Responsive/accessibility behavior relies on the underlying design system's
  existing guarantees; this pass did not do independent device/screen-reader
  testing.
- The `BusinessProfile`→multi-business schema change and the `FileAsset`
  system are net-new, not verified-against-existing-data migrations, since
  no real database exists to test against here.

## 11. Module 5 Business Context integration contract

**Import and call directly — do not re-derive this data from the DB models.**

```ts
import { resolveBusinessContext } from "@/modules/context/service";
import type { BusinessContext } from "@/types/business-context";

// workspaceUser: resolved the same way every other module resolves it —
// requireWorkspaceAccess(workspaceSlug) in an API route, or
// getWorkspaceUserOrRedirect(workspaceSlug) in a Server Component.
// businessId: from a route param, re-verified inside resolveBusinessContext
// itself (it calls requireBusinessAccess internally) — Module 5 does not
// need to (and should not) re-implement that check.

const context: BusinessContext = await resolveBusinessContext(workspaceUser, businessId);
```

Full shape in `src/types/business-context.ts`: `workspace`, `business`,
`goals`, `brand` (nullable — a business may not have brand identity filled
in yet), `audienceSegments` + `primaryAudience` (nullable), `brandAssets`
(metadata only — no raw bytes; call the assets module for a fresh presigned
URL if actual file content is ever needed), `profileCompletionScore`
(0-100, real), `resolvedAt` (ISO timestamp — treat as a snapshot, not a
live subscription).

**Rules for Module 5:**
1. Never call an AI provider from inside `src/modules/context/` — that
   module's job is aggregation only, and it must stay that way for the
   separation of concerns to hold.
2. Never query `BusinessProfile`/`BrandIdentity`/`AudienceSegment` directly
   from Module 5 code — always go through `resolveBusinessContext()`, so
   authorization and field-mapping logic live in exactly one place.
3. Treat a `null` `brand` or empty `audienceSegments` as a real, valid
   state (an incomplete profile), not an error — use
   `profileCompletionScore` to decide whether to prompt the user to fill in
   more before generating, rather than failing.
4. The HTTP entry point (`GET /api/v1/workspaces/{slug}/businesses/{id}/context`)
   exists for cases where an HTTP boundary is unavoidable (e.g. a separate
   service), but direct import is preferred within the same Next.js app.

---

## Not proceeding to Module 5

Stopping here per the brief. Ready for review.
