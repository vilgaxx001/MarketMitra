# Module 5B.1 — Business AI Preferences: Delivery Report

NOTE: the brief file I received was cut off mid-Phase 6 (it ends at "Do not allow user-edit"). Phases 1–6 were implemented as written; testing/validation/reporting followed the standards of the 5A passes. Any requirement in the missing part was not seen.

Status key: VERIFIED / ENVIRONMENT-UNVERIFIED / DEFERRED.

## Audit findings (VERIFIED by reading the repo)
- Module 4 already owns preferred language (`BusinessProfile.preferredLanguage`) and tone (`BrandIdentity.tone`) → not duplicated; read from the resolved `BusinessContext`.
- The 5A orchestrator resolved business context but never passed it to providers; 5B.1 adds the first consumer.
- `prisma/migrations` is empty; no migration convention to follow.
- Existing permission/audit/route/Zod patterns (brand module) were reused. No other module has tests, so repository/service tests use mocks.

## Delivered
- **Schema:** `BusinessAIPreferences` (1:1 with business, unique `businessId`, cascade), enums `AIDetailLevel`, `AIFormattingPreference`.
- **Module `src/modules/ai/preferences/`:** types (contract + defaults), strict Zod validators, repository (atomic upsert + P2002 retry), service (get/update/reset/resolve-effective, workspace re-verification, audit), pure directive builder, index.
- **API:** `GET|PATCH|DELETE …/businesses/[businessId]/ai-preferences`; new permissions `ai-preferences:read` (ADMIN, TEAM_MEMBER) and `ai-preferences:edit` (ADMIN).
- **Execution:** `CoreExecutionContext.businessPreferences`; `resolveExecutionContext` loads it; orchestrator appends the directive after the caller's system text (no DB access in the orchestrator).
- **Activity log:** `ai_preferences.updated|reset` actions + labels.
- Docs: `docs/AI_PREFERENCES.md`, AI_CORE §32.

## Files changed
Modified: `prisma/schema.prisma`, `src/modules/rbac/permissions.ts`, `src/modules/activity/types.ts`, `src/app/(app)/[workspaceSlug]/activity/page.tsx`, `src/modules/ai/core/types/execution-context.ts`, `src/modules/ai/core/context/execution-context.service.ts`, `src/modules/ai/core/orchestrator.ts`, `src/modules/ai/core/__tests__/orchestrator.test.ts` (added a mock), `docs/AI_CORE.md`.
New: `src/modules/ai/preferences/{types,validators,repository,directive,service,index}.ts`, `…/preferences/__tests__/{validators,directive,repository,service,permissions}.test.ts`, `src/modules/ai/core/__tests__/preferences-execution.test.ts`, the API route, `docs/AI_PREFERENCES.md`, this report.

## Validation
- Vitest `src/modules/ai` (single-fork flags): 20 files, **161/161 passed** (VERIFIED). New tests cover validation (unknown fields, limits, delimiter forging), directive building/ordering/sanitization, IDOR (business outside workspace → NOT_FOUND, no data access), audit content (field names only), defaults, reset, concurrency retry, permissions, and the pipeline (provider receives the block after the system text, defaults leave requests unchanged, no business context → untouched, access denial/preferences failure → no provider call, routing unaffected).
- `npx tsc --noEmit`: no errors in new/changed files; only the pre-existing Prisma-client cascade remains (VERIFIED, with that caveat).
- `npx eslint . --ext .ts,.tsx`: exit 0 (VERIFIED).
- Scans: no ts-ignore/any/TODO in new code; no DB import in AI core (VERIFIED).
- **ENVIRONMENT-UNVERIFIED:** `prisma validate`/`generate` (engine download 403), so the schema was not machine-validated and the repository's calls were not type-checked against a generated client; **migration not created or applied**; no API route test against a real DB/HTTP; `next build` not run (previously blocked at font fetch); no live provider call, so the effect of the directive on real model output is untested.

## Security notes
Instructions/constraints are untrusted free text. Mitigations: no system-prompt field, strict schema, `<`/`>` + control chars rejected and re-stripped at render, length caps, subordinate framing, appended after platform text. This is a mitigation, not a guarantee; enforcement remains in code that preferences cannot reach. No secrets stored (no key fields; unknown fields rejected). Audit logs never contain the text.

## Remaining / DEFERRED
- Run the migration in a connected environment; verify with a generated client.
- UI for editing preferences (no UI requested).
- Optimistic-concurrency (revision) not added: last-write-wins matches Module 4.
- No memory (5B.2+), RAG, tools or hardening started.

Stopped after 5B.1.
