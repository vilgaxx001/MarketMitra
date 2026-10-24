# Module 5B.1 Fix Pass — Migration + Tenant Context Validation

Classification: VERIFIED / FAILED / ENVIRONMENT-UNVERIFIED / DEFERRED.

**Provenance note (please read):** when this pass started, the working repository already contained the migration directory, the workspace-mismatch guard and the new tests below (files dated 2026-10-10 09:47, after my previous delivery zip, which had none of them). Your brief says no migration exists, so this is a discrepancy. I did not author them in this pass; I reviewed them line by line against the schema and requirements, re-ran everything, and mutation-checked the guard. I made no further code changes.

## 1. Files (present in the repo; none created by me in this pass)
- `prisma/migrations/20261010120000_add_business_ai_preferences/migration.sql` (new)
- `prisma/migrations/migration_lock.toml` (new, `provider = "postgresql"`)
- `prisma/migrations/README.md` (new — baseline/deployment instructions)
- `src/modules/ai/core/context/execution-context.service.ts` — `assertRequestWorkspaceMatches()` + call at the top of `resolveExecutionContext()`
- `src/modules/ai/core/orchestrator.ts` — same guard before the rate limiter
- `src/modules/ai/preferences/__tests__/migration.test.ts` (new), `src/modules/ai/core/__tests__/workspace-context.test.ts` (new)
- `package.json` / `package-lock.json` — devDependency `@electric-sql/pglite@0.5.8` (embedded PostgreSQL/WASM, used only by the migration test)
Earlier 5B.1 files (`prisma/schema.prisma`, preferences module, API route, etc.) are unchanged.

## 2. Migration — directory and SQL
Directory: `prisma/migrations/20261010120000_add_business_ai_preferences/`
```sql
CREATE TYPE "AIDetailLevel" AS ENUM ('CONCISE', 'STANDARD', 'DETAILED');
CREATE TYPE "AIFormattingPreference" AS ENUM ('NO_PREFERENCE', 'PLAIN_TEXT', 'MARKDOWN', 'BULLET_POINTS');
CREATE TABLE "business_ai_preferences" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "detailLevel" "AIDetailLevel" NOT NULL DEFAULT 'STANDARD',
    "formatting" "AIFormattingPreference" NOT NULL DEFAULT 'NO_PREFERENCE',
    "businessInstructions" VARCHAR(1000),
    "behaviorConstraints" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "business_ai_preferences_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "business_ai_preferences_businessId_key" ON "business_ai_preferences"("businessId");
ALTER TABLE "business_ai_preferences" ADD CONSTRAINT "business_ai_preferences_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```
It is additive only (no DROP/ALTER of existing objects other than adding its own FK). It follows Prisma's naming (`_pkey`, `_key`, `_fkey`).

## 3. Validation status
| Item | Status |
|---|---|
| SQL hand-derived, checked against the `BusinessAIPreferences` model (columns, types, nullability, defaults, `@db.VarChar(1000)`, `@unique`, cascade, `@@map`, enum values/order) by an automated text-consistency test | VERIFIED (static) |
| SQL executed on a real PostgreSQL engine (PGlite, PostgreSQL 18.3 in WASM): defaults, unique `businessId`, FK rejection, cascade delete (only the owning business's row), enum rejection, 1000/1001-char limit | VERIFIED — against a **stand-in** `business_profiles(id)` table, not your real schema, and not your production Postgres version |
| `prisma validate` / `format` / `generate` / `migrate diff` | ENVIRONMENT-UNVERIFIED — Prisma's engine download is blocked (403); attempted once this pass, not retried. The schema was not machine-validated by Prisma and the SQL was not compared with Prisma's own generated SQL |
| Migration applied to a real/staging/production database | **NOT APPLIED** — ENVIRONMENT-UNVERIFIED |
| Baseline for Modules 1–4 | DEFERRED — the repo has no migration history; `README.md` documents both paths (existing DB: `db execute` + `migrate resolve --applied`; fresh DB: create a baseline from the pre-5B.1 schema first). Running `migrate dev/deploy` on a fresh DB without a baseline fails safely at this migration. |
After applying, run `prisma migrate diff --from-migrations … --to-schema-datamodel … --exit-code` (command in the README) in a connected environment.

## 4. Workspace-context guard — VERIFIED
`request.workspaceId` must equal `workspaceUser.workspaceId`, else `AICoreError INVALID_REQUEST` (generic message, no IDs). Checked in `executeAICoreRequest()` **before the rate limiter** (a mismatched request cannot consume another workspace's quota) and again at the top of `resolveExecutionContext()` (the exported seam). Tests (8) prove: mismatch rejected before business access, context or preference access and before any provider call, including when no business context is requested; matching requests execute; the same user can legitimately work in workspace B when request and authorization both say B; the existing business-ownership denial still blocks preferences/provider. **Mutation check:** removing both guard calls makes 3 of these tests fail; guard restored.
Observation, not changed: `request.actorUserId` is not compared with `workspaceUser.id`; it is not used for authorization today but will matter for audit/memory in later modules.

## 5. Test, TypeScript, ESLint results
- Full Vitest run (single-fork flags): **22 files, 181/181 passed** — VERIFIED. This includes the 5B.1 service/validator/directive/permissions/repository tests (defaults, reset, validation, permissions, cross-business isolation) and all 5A tests. There are no automated Module 4 tests in the repo to run.
- `npx tsc --noEmit`: no errors besides the known Prisma-client cascade — VERIFIED with that caveat.
- `npx eslint . --ext .ts,.tsx`: exit 0 — VERIFIED.
- `npm audit`: see below; no `audit fix` run.

## 6. Remaining limitations
- Migration unapplied and not machine-validated by Prisma (see §3); the PGlite test cannot prove behaviour against the real `business_profiles` table or production Postgres version.
- `next build` not run (previously blocked at font fetch) — ENVIRONMENT-UNVERIFIED. No live provider/DB/HTTP route test.
- Baseline migration for earlier modules still needs to be generated in a connected environment.

Module 5B.2 and later modules were **not** started. Stopped for independent KILLCRITIC review.
