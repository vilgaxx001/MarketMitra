# Module 5A — Registry Safety Fix: Final Report (2026-10-10)

Status key: VERIFIED / ENVIRONMENT-UNVERIFIED / DEFERRED.

## 1. Files changed — VERIFIED
- `src/modules/ai/core/types/model.ts` — `"UNVERIFIED"` availability state; optional `verification` evidence on `ModelDefinition`.
- `src/modules/ai/core/types/routing.ts` — rejection reason `MODEL_METADATA_UNVERIFIED`.
- `src/modules/ai/core/models/model.registry.ts` — verification-aware `resolveModelAvailability`, `listUnverifiedModels`, test-only catalog override, updated rows and evidence.
- `src/modules/ai/core/routing/router.ts` — rejects unverified rows before capability/provider checks.
- `src/modules/ai/core/index.ts` — exports `listUnverifiedModels`.
- `vitest.config.ts`, `test/fixtures-model-catalog.ts`, `test/setup/model-catalog.ts` (new) — synthetic fixture catalog for router/orchestrator tests.
- Tests: `model-availability.test.ts` (new, 9), `model-registry.test.ts`, `router.test.ts`, `preferred-capabilities.test.ts` (fixture IDs / updated assertions).
- `docs/AI_CORE.md` §31, this report.
No SDK upgrades and no adapter changes.

## 2. Model verification results — VERIFIED against official docs (fetched 2026-10-10)
| Model | Result | Source |
|---|---|---|
| gpt-4o | **VERIFIED**: ID, 128,000 context, 16,384 max output, image input, streaming, structured outputs, `v1/chat/completions`. Snapshot `gpt-4o-2024-05-13` is deprecated; the alias is not. JSON mode covered by `gpt-4o-*` in the structured-outputs guide. | https://developers.openai.com/api/docs/models/gpt-4o ; https://developers.openai.com/api/docs/guides/structured-outputs ; https://developers.openai.com/api/docs/deprecations |
| gpt-4o-mini | **VERIFIED**: same fields as above; no deprecation. The guide's JSON-mode row does not name it explicitly (covered only through the `gpt-4o-*` pattern). | https://developers.openai.com/api/docs/models/gpt-4o-mini ; same guide and deprecations page |
| claude-3-5-sonnet-20241022 | **Retired 2025-10-28** → `DEPRECATED` (verified) | https://platform.claude.com/docs/en/about-claude/model-deprecations |
| claude-3-5-haiku-20241022 | **Retired 2026-02-19** → `DEPRECATED` (verified) | same |
| gemini-1.5-pro | **Shut down 2025-09-29** → `DEPRECATED` (verified) | https://ai.google.dev/gemini-api/docs/changelog |
| gemini-1.5-flash | **Shut down 2025-09-29** → `DEPRECATED` (verified) | same |

SDK compatibility: only checked as far as the OpenAI adapter using `chat.completions` (installed `openai@4.78.1`) against the documented `v1/chat/completions` endpoint; no live call was made. Sonnet/Haiku 3.5 and Gemini 1.5 limits/capabilities were not re-verified since they cannot be served.

## 3. Models still unverified and excluded — VERIFIED
No row is merely "unverified" now; the four retired rows keep `UNVERIFIED_TRAINING_DATA` for their other metadata and are excluded as `DEPRECATED`. Anthropic's docs name replacements (`claude-haiku-4-5-20251001`, `claude-sonnet-5-5`); they are **not added** because their limits, capabilities and compatibility with `@anthropic-ai/sdk@0.32.1` are unverified. Gemini has no verified current model registered either (the deprecations/models pages I fetched did not give details I could rely on).

**Operational consequence:** only OpenAI (gpt-4o, gpt-4o-mini) is routable. There are no real cross-provider fallback candidates until verified Anthropic/Gemini models are added in a separate change (which may need SDK work — to be reported then).

## 4. Safety behaviour — VERIFIED (tests)
Unverified rows → `"UNVERIFIED"`, never returned by `listAvailableModels()`, rejected by the router (`MODEL_METADATA_UNVERIFIED`) even when preferred and even with a configured key; deprecated rows stay excluded and are not labelled unverified; verified+configured models stay selectable; `listModels()`/`listUnverifiedModels()` still inspect everything.

## 5. Tests / TypeScript / ESLint — VERIFIED
- `npx vitest run src/modules/ai/core/__tests__/` (single-fork flags): 14 files, **121/121 passed** (new + existing). All use fakes/fixtures; no live provider call.
- `npx tsc --noEmit`: no errors except the known Prisma-client cascade (engine download blocked).
- `npx eslint . --ext .ts,.tsx`: exit 0, no output.
- Scans (no SDK imports outside adapters, no ts-ignore/any/TODO/FIXME/HACK in AI module/tests): clean.

## 6. Build — ENVIRONMENT-UNVERIFIED
`next build` was not re-run this pass; its last attempt failed at the Google Fonts fetch (blocked network). Not claimed as passing.

## 7. Remaining security / dependency findings
`npm audit`: 73 findings (3 critical, 32 high, 37 moderate, 1 low), unchanged by this pass; no dependency changes, no `audit fix`. Known open items: Redis rate limiter fails open (not production-grade; 5E replaces it); provider health is in-memory; live provider calls never exercised.

Stopped. Module 5B not started.
