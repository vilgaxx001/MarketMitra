# Workspace, Business & Organization System (Module 4)

This document covers the architecture Module 4 adds on top of Modules 1–3
(Foundation, Design System, Auth & RBAC). It assumes familiarity with
`docs/ARCHITECTURE.md`'s module-layering conventions (`repository.ts` →
`service.ts` → routes) and `docs/RBAC.md`.

---

## 1. Workspace architecture

A `Workspace` is the top-level tenant boundary — everything else (businesses,
members, invites, file assets, activity) is scoped to one. Workspace context
is resolved from the URL (`/{workspaceSlug}/...`), never from a stored
"current workspace" pointer — this was already the Module 3 design
(`requireWorkspaceAccess()` / `getWorkspaceUserOrRedirect()` in
`src/lib/middleware/require-auth.ts`), and Module 4 builds directly on it
rather than introducing a second mechanism.

`src/modules/workspace/` implements the lifecycle: create, update, archive,
restore, leave. A workspace can never be left by its only remaining ADMIN
(enforced in `service.ts`, not just the UI) — that would strand the
workspace with no one able to manage it.

## 2. Multi-business architecture

**This is new in Module 4.** The `BusinessProfile` model previously had
`workspaceId @unique` — a hard one-business-per-workspace constraint. There
was no prior migration establishing multi-business support in this
repository (see the Module 4 delivery report for the full account of what
was and wasn't already in place). This pass removed that constraint,
added a `slug` (unique per workspace), lifecycle fields (`isActive`,
`archivedAt`), and the richer profile fields the brief specifies.

A workspace's business limit comes from `Plan.maxBusinesses` (new column,
mirroring the existing `maxWorkspaceSeats`/`maxGenerationsPerMonth` pattern)
via the workspace's `Subscription`. See §9 for what happens when there's no
subscription yet.

## 3. Active workspace / active business resolution

- **Active workspace**: the URL slug, verified via `requireWorkspaceAccess()`
  (API routes) or `getWorkspaceUserOrRedirect()` (Server Components/pages).
  Unchanged from Module 3.
- **Active business**: new in Module 4 — `src/lib/middleware/require-business.ts`.
  Because a workspace can have several businesses, "which one is the user
  currently working in" needs its own resolution, but it's a UX preference,
  not a security boundary. It's stored in a plain `HttpOnly` cookie scoped
  per workspace (`mm_active_business_{workspaceId}`), and **always
  re-verified** against the database (workspace ownership + `isActive`)
  before being trusted — a tampered or stale cookie value just falls
  through to the workspace's first active business, never to cross-tenant
  data. This is what "browser state must never be the security authority"
  means concretely here.

Two entry points:
- `resolveActiveBusiness(workspaceUser)` — cookie-first, falls back to the
  first active business, returns `null` if none exist yet.
- `requireBusinessAccess(workspaceUser, businessId)` — explicit-ID entry
  point for routes that receive a `businessId` param; this is the IDOR
  guard every business-scoped route calls before touching data.

## 4. Business Context Engine

`src/modules/context/service.ts` + `src/types/business-context.ts`.

**Not Module 5 AI Memory.** No embeddings, no vector search, no
conversation state, no AI provider calls (never imports an AI SDK).
It's a pure aggregation of trusted Module 4 data — business profile, brand
identity, audience segments, brand asset metadata — into one stable,
typed shape.

### How Module 5 must consume it

```ts
import { resolveBusinessContext } from "@/modules/context/service";

// workspaceUser comes from requireWorkspaceAccess() — Module 5 code must
// resolve its own caller's workspace access the same way every other
// module does. Never skip straight to a businessId from client input.
const context = await resolveBusinessContext(workspaceUser, businessId);
```

The returned `BusinessContext` (see `src/types/business-context.ts` for the
full shape) is a **snapshot** — `resolvedAt` is an ISO timestamp, not a
live subscription. If Module 5 needs freshness guarantees beyond
"resolved at request time," that's Module 5's responsibility to add
(e.g. re-resolving per generation request), not something this engine
provides.

**Do not** bypass this module and query `BusinessProfile`/`BrandIdentity`/
`AudienceSegment` directly from Module 5 code — that would duplicate the
authorization checks and the field-mapping logic in two places.

The HTTP-level entry point (for a debug view, or if Module 5 ends up
calling over HTTP rather than importing directly) is
`GET /api/v1/workspaces/{workspaceSlug}/businesses/{businessId}/context`.

## 5. Business profile architecture

`src/modules/business/` (types, validators, repository, service). Fields
map directly to the brief's list — see `prisma/schema.prisma`'s
`BusinessProfile` model docstring for the full field-by-field rationale.

**Profile completion score** (`src/modules/business/completion-score.ts`)
is computed from which fields are *actually* filled in — no fabricated
progress. Weighted toward brand identity and audience data (the fields
that most affect Module 5 output quality).

## 6. Brand identity architecture

`src/modules/brand/` — 1:1 with a business (`BrandIdentity.businessId @unique`).
Typed fields (`String[]` for word lists / personality / values, not a
freeform text blob) so Module 5 gets a stable shape to prompt from rather
than needing to parse prose. Upsert semantics (`PATCH` creates the row on
first write) since a business can exist before its brand identity is
filled in.

## 7. Audience architecture

`src/modules/audience/` — multiple named segments per business. At most
one `isPrimary: true` per business, enforced with a transaction
(unset-then-set) in `repository.ts::setPrimary`, not a DB constraint —
Postgres partial unique indexes aren't expressible in this project's
Prisma schema syntax without a raw migration, and a transaction is simpler
and equally correct here.

## 8. Invitation lifecycle

`src/modules/team/` reuses the existing `TeamInvite` model and RBAC roles
(`ADMIN` / `TEAM_MEMBER` / `CLIENT`) — no new roles, no parallel
permission system. Tokens follow the exact pattern already established in
`src/modules/auth/service.ts` for email verification / password reset:
`nanoid(48)` raw value, SHA-256 hash persisted (`TeamInvite.tokenHash`),
raw value only ever exists in the email link.

State machine (`InviteStatus`): `PENDING → ACCEPTED | EXPIRED | REVOKED`.
- Accepting requires the accepting user's session email to match the
  invite exactly (prevents forwarding an invite link to someone else).
- Expired invites are marked `EXPIRED` lazily, on the next access attempt.
- Resending rotates the token (old link stops working) and extends the
  expiry.
- The invite email uses the existing `emailTemplates.teamInvite` template
  (already present in `src/lib/email.ts` — reused, not rebuilt).

## 9. RBAC integration

`src/modules/rbac/permissions.ts` gained the Module 4 action set
(`workspace:archive`, `business:*`, `brand:*`, `audience:*`, `asset:*`,
`activity:read`) — extending the existing `WORKSPACE_PERMISSIONS` matrix,
not a new authorization system. Every API route calls
`requirePermission(workspaceUser, action)` before touching data; every
page checks `can(workspaceUser, action)` before rendering a mutation
control. Hidden buttons are not the security boundary — the route-level
check is.

## 10. File asset integration

**This is new in Module 4** — no `FileAsset`/`FileAssetVersion` models or
S3 integration code existed in this repository beforehand (the AWS SDK
packages were declared as dependencies but never imported anywhere; see
the delivery report for the full account).

- `FileAsset` (the logical, named thing) has one or more `FileAssetVersion`
  rows (the actual uploaded bytes at a point in time).
- **Deduplication**: re-uploading identical content (matched by
  `sha256Hash`, computed client-side via `crypto.subtle.digest`) reuses
  the existing `storageKey` instead of writing a duplicate S3 object —
  see `src/modules/assets/repository.ts::findExistingVersionByHash`.
- **MIME validation**: never trusts the client's declared type alone.
  `src/modules/assets/mime-sniff.ts` reads the first bytes of the
  actually-uploaded object and checks magic-byte signatures before the
  confirm-upload step persists anything.
- **Malware scanning**: `src/modules/assets/scan-contract.ts` is a real
  integration point, currently unconnected — every version is created
  `PENDING`→`SKIPPED` (never a fabricated `CLEAN`) until a real scanner
  (ClamAV, VirusTotal, GuardDuty) is wired in.
- **Credentials**: never leave the server. Clients only ever receive
  short-lived presigned URLs (`src/modules/assets/storage.ts`).

## 11. Activity logging

Reuses the existing `AuditLog` model (functionally identical to what the
brief calls "ActivityLog" — see `src/modules/activity/types.ts`'s
docstring for why a second, parallel table wasn't created).
`src/modules/activity/service.ts::logActivity()` is called from every
Module 4 mutation; a defense-in-depth redaction pass strips any metadata
key that looks like a secret before persisting, on top of the rule that
call sites must never pass passwords/tokens/API keys to it in the first
place.

## 12. Audit log query readiness (for Module 9)

`src/modules/activity/service.ts::queryActivity()` supports filtering by
actor, action, entity type/id, workspace, business (matched via the JSON
metadata blob — `AuditLog` has no `businessId` column), and date range,
with pagination. `GET /api/v1/workspaces/{slug}/activity` exposes it.
This is the query contract Module 9's Admin UI consumes — the admin panel
itself is out of scope here.

## 13. Plan limit enforcement

`src/modules/business/service.ts::getBusinessLimit()` reads
`Subscription.plan.maxBusinesses`. **Most workspaces don't have a
`Subscription` row yet** (Module 8 billing isn't built), so there's a
documented fallback constant (`DEFAULT_MAX_BUSINESSES_NO_SUBSCRIPTION = 1`)
— not a crash, not an unlimited bypass. Reaching the limit returns the
existing `PLAN_LIMIT_REACHED` typed API error (already defined in
`src/lib/api-response.ts` — reused, not invented) with `{ limit,
currentCount }` in `details`. The business is not created; nothing is
auto-upgraded or simulated as paid.

---

## Known limitations / deferred integrations

See the Module 4 delivery report for the full list, including what
couldn't be verified in this sandbox (Prisma Client generation, full
production build) and what's intentionally deferred to Module 5 (AI
provider calls) and Module 8 (real billing/subscription creation, so
`getBusinessLimit()`'s fallback path is actually exercised today).
