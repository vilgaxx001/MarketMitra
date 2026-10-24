# Module 5B.2 — Memory Foundation: Delivery Report

Classification: VERIFIED / FAILED / ENVIRONMENT-UNVERIFIED / DEFERRED. No approval is claimed; this is submitted for independent KILLCRITIC review.

## 1. Repository audit findings
- **Provenance (important):** when this session started, most of 5B.2 was already in the working repository (files dated 2026-10-11, after my last delivery): schema models, migration `20261011120000_add_business_memories`, the memory module, 4 route files, RBAC/activity additions and 7 test files. I did not author them in this session. I reviewed every source file line by line, ran everything, mutation-checked the isolation tests, and made the two changes listed in §4. Please weigh this when reviewing.
- Confirmed existing signatures/patterns reused: `requireWorkspaceAccess`, `requirePermission`, `businessRepo.findByIdInWorkspace`, `logActivity`, `withApiHandler/apiSuccess/apiError/ApiException`, Zod, the `BrandIdentity`-style `createdBy` relations.
- Direct relation to the authoritative `BusinessProfile` exists → a dedicated table is justified (many records per business, own lifecycle). No new auth middleware needed.
- Known limitation (not hidden, not resolved): Modules 1–4 have no migration baseline; Prisma tooling cannot download its engines here.

## 2. Data model and schema changes — VERIFIED (static + embedded Postgres)
Enums `BusinessMemoryType` (BUSINESS_FACT, BUSINESS_PREFERENCE, BUSINESS_GOAL, BUSINESS_CONSTRAINT), `BusinessMemoryStatus` (ACTIVE default, ARCHIVED); model `BusinessMemory` (`business_memories`): businessId FK cascade, type, status, label ≤120, content ≤2000 required, metadata JSONB default `{}`, expiresAt, createdById/updatedById FK SET NULL, timestamps, index `(businessId, status, createdAt)`. No uniqueness on content, no embeddings, no transcript field. Back-relations on `User` and `BusinessProfile`. Limits, expiry and lifecycle semantics are documented in `docs/AI_MEMORY.md` and `memory/types.ts`.

## 3. Migration
Directory `prisma/migrations/20261011120000_add_business_memories/migration.sql`: 2 enums, 1 table, 1 index, 3 foreign keys (additive only). The 5B.1 migration is byte-identical to the approved micro-fix version (checked). README documents the dependency on `business_profiles` and `users` and that the baseline gap is unresolved.
- SQL ↔ schema consistency test and execution on PGlite (PostgreSQL 18.3/WASM: defaults, enum/NOT NULL/length constraints, FK rejection, cascade to that business's memories only, SET NULL on user delete, index present): **VERIFIED** — against stand-in `business_profiles`/`users` tables, not your real schema or production Postgres.
- Prisma `validate`/`generate`/`migrate diff`: **ENVIRONMENT-UNVERIFIED** (engine download 403, attempted once this pass). SQL hand-derived; not compared with Prisma's generated SQL. **Not applied to any database** (ENVIRONMENT-UNVERIFIED).

## 4. Files
Created (present before this session; reviewed): `prisma/migrations/20261011120000_add_business_memories/migration.sql`; `src/modules/ai/memory/{types,validators,repository,service,http,index}.ts`; `src/modules/ai/memory/__tests__/{validators,repository,service,routes,migration,permissions,boundary}.test.ts`; routes `…/businesses/[businessId]/ai-memories/{route.ts,[memoryId]/route.ts,[memoryId]/archive/route.ts,[memoryId]/restore/route.ts}`.
Modified (present before): `prisma/schema.prisma`, `prisma/migrations/README.md`, `src/modules/rbac/permissions.ts`, `src/modules/activity/types.ts`, `src/app/(app)/[workspaceSlug]/activity/page.tsx`.
**Changed/created by me this session:** `src/modules/ai/memory/__tests__/routes.test.ts` (fixed 5 real `tsc` errors: the test helper's params lacked `memoryId`), `docs/AI_MEMORY.md` (new), `docs/AI_CORE.md` (+§33), this report. No other code touched; AI Core/orchestrator untouched.

## 5. Memory service API
`createBusinessMemory`, `listBusinessMemories` (views active|archived|all, type filter, limit ≤100/offset; 2 queries), `getBusinessMemory`, `updateBusinessMemory`, `archiveBusinessMemory`, `restoreBusinessMemory`, `deleteBusinessMemory` — all `(…, businessId, workspaceId, actorId, …)`, validated by strict Zod schemas. Archived memories are read-only (409); archive/restore idempotent; delete is permanent.

## 6. Routes and permissions
`GET|POST /ai-memories`, `GET|PATCH|DELETE /ai-memories/{id}`, `POST /ai-memories/{id}/archive|restore`. `ai-memory:read` = ADMIN, TEAM_MEMBER; `create|edit|delete` = ADMIN only; CLIENT none (admin-only writes because stored memory will later influence AI output; documented).

## 7. Tenant isolation / security — VERIFIED (mocked-service and mocked-db tests; not a real-database test)
Business re-verified against the workspace on every call; every record query scopes by `businessId`; foreign and missing ids return the same 404; `businessId`/status/audit fields cannot be sent (strict schema); audit logs carry ids and field names only (tested across all five actions); 16 KB body cap, malformed JSON → 400; secret/card-shaped text, angle brackets and control characters rejected (best-effort heuristic, not a guarantee — documented). Mutation checks: removing `businessId` scoping from the repository, or the workspace check from the service, each makes tests fail. Full risk table: `docs/AI_MEMORY.md`.

## 8. Tests — VERIFIED
Full run (single-fork flags): **29 files, 257/257 passed.** Memory: 75 (validators 13, repository 7 [mocked db], service 15 [mocked deps], routes 19 [real handlers/validators/RBAC, mocked auth+service], migration 14 [static + PGlite], permissions 3, boundary 4). 5B.1 preference tests and all 5A tests pass unchanged. Brief item 11 (expiry) and 18 (5A unaffected; AI Core does not import memory, `CoreExecutionContext` has exactly the pre-5B.2 fields) are covered.

## 9. TypeScript / ESLint — VERIFIED
`npx tsc --noEmit`: nothing beyond the known Prisma-client cascade (it previously reported 5 genuine errors in `routes.test.ts`; fixed). `npx eslint . --ext .ts,.tsx`: exit 0.

## 10. Prisma / build
Prisma validate/generate: ENVIRONMENT-UNVERIFIED. `next build`: not run — ENVIRONMENT-UNVERIFIED (previously blocked at font fetch). `npm audit`: 73 findings (3 critical, 32 high, 37 moderate, 1 low), unchanged; no upgrades or `audit fix`.

## 11. Environment limitations
No Prisma engines; no real database (repository code is exercised only against a mocked client; SQL only on PGlite with stand-in tables); no HTTP/server run; no live provider.

## 12. Deferred (not implemented, by scope)
Extraction, LLM generation, retrieval/injection, embeddings, RAG, agents/tools, workers, summarization, expiry jobs, billing; Modules 1–4 migration baseline; UI for memory.

## 13. Integration contract for 5B.3/5B.4
See `docs/AI_MEMORY.md`: read via `listBusinessMemories(businessId, workspaceId, { view: "active" })` inside `resolveExecutionContext()` after business access and the workspace-match guard; never bypass `executeAICoreRequest()`; render as untrusted, delimited, subordinate data with count/size bounds; no Module 4 table queries from AI Core. Not implemented now.

Stopped after 5B.2. 5B.3 not started.
