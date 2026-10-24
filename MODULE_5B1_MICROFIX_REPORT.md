# 5B.1 Final Micro-Fix — Report

## Change
`prisma/migrations/20261010120000_add_business_ai_preferences/migration.sql`, one line:
`"behaviorConstraints" TEXT[] DEFAULT ARRAY[]::TEXT[],` → `"behaviorConstraints" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],`
Inspected first: the schema declares `behaviorConstraints String[] @default([])` (a non-optional list), so NOT NULL matches the model's meaning (the app reads it as `string[]`).

## Files changed (exactly)
- `prisma/migrations/20261010120000_add_business_ai_preferences/migration.sql` — the line above
- `src/modules/ai/preferences/__tests__/migration.test.ts` — consistency regex now requires `NOT NULL`; new database test (see below)
- `prisma/migrations/README.md` — appended a note about scalar-list nullability and the pending Prisma drift check
No other files were touched.

## New test (executed on PGlite, embedded PostgreSQL 18.3/WASM)
Omitting `behaviorConstraints` on insert yields `[]`; explicit `NULL` on insert is rejected (not-null violation); `UPDATE … SET behaviorConstraints = NULL` is rejected; an explicit array is accepted. Mutation check: reverting the SQL to the nullable form makes the consistency test fail (restored afterwards).

## Other columns reviewed against the schema — no mismatches found
`id` TEXT PK; `businessId` TEXT NOT NULL + unique index `…_businessId_key`; FK `…_businessId_fkey` → `business_profiles(id)` ON DELETE CASCADE ON UPDATE CASCADE; `detailLevel`/`formatting` enum NOT NULL with defaults STANDARD/NO_PREFERENCE; `businessInstructions` nullable VARCHAR(1000) (schema `String? @db.VarChar(1000)`); `createdAt` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP; `updatedAt` TIMESTAMP(3) NOT NULL without default (`@updatedAt` is client-side). Enum value lists match. These were already asserted by the consistency test; nothing else changed.

## Results
- Full Vitest run (single-fork flags): 22 files, **182/182 passed** (was 181; +1 new test) — VERIFIED.
- `npx tsc --noEmit`: nothing beyond the known Prisma-client cascade — VERIFIED with that caveat.
- `npx eslint . --ext .ts,.tsx`: exit 0 — VERIFIED.

## Not verified / remaining deployment requirements
- **Prisma validation: ENVIRONMENT-UNVERIFIED.** Prisma's engine cannot be downloaded here; `validate`, `format`, `generate` and `migrate diff` were not run this pass.
- **Possible Prisma drift on this column:** Prisma's own generated SQL for scalar lists may not include `NOT NULL`. I could not check. In a connected environment run the `migrate diff --from-migrations … --to-schema-datamodel … --exit-code` command from `prisma/migrations/README.md`; if it reports drift only on this column, decide between keeping the stricter NOT NULL (and accepting a follow-up migration/noted drift) or reverting to Prisma's form.
- **Not applied to any database.** PGlite uses a stand-in `business_profiles(id)` table, not your real schema or production Postgres version.
- Baseline migration for Modules 1–4 is still absent (steps in the README). `next build` not run.
Module 5B.2 not started.
