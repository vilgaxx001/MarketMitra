# MarketMitra — Final Pre-5C Release Gate Closure Report

**Verdict: `ENVIRONMENT-UNVERIFIED — CI EXECUTION OR REQUIRED GATES BLOCKED`**

*(Previous headline: `ENVIRONMENT-UNVERIFIED — AUTHORITATIVE GATE BLOCKED`. The substance is unchanged: the authoritative gates are still blocked here. A CI workflow to close them has now been prepared (§12) but has **not been executed**. The body below (§1–§11) is the earlier closure report, preserved unchanged; the pre-edit copy is `docs/history/PRE_5C_RELEASE_GATE_REPORT_2026-10-22_before-ci-workflow.md`.)*

The pinned Prisma 6.2.1 CLI cannot run in this environment (policy-denied `403` for `binaries.prisma.sh`), so the authoritative Prisma, migration/drift, genuine-client TypeScript/build and genuine-client HTTP gates are **BLOCKED**, not passed. No substitute result is counted as a pass. All checks that *can* run here pass, and I found no unresolved code defect (three defects found in this run were fixed, §6). Module 5C was not started. This report supersedes `docs/history/PRE_5C_RELEASE_GATE_REPORT_2026-10-18.md` (same filename, earlier task) and the numbers in `PRE_5C_SECURITY_AND_FINAL_GATE_REPORT.md` (e.g. its 127-check count is now 135).

Evidence files are in `docs/evidence/pre5c-final-gate/` (referenced as `[E:name]`). Database URLs in evidence were replaced with `postgresql://<redacted>` (they were local, passwordless, disposable instances); no secret value is present (searched for the session secret).

## 1. Baseline (before any edit)

| Item | Value |
|---|---|
| Artifact tested | `marketmitra-app-pre5c-security-final-gate.zip` (my previous delivery), sha256 `d2b2b21721122829f2e6e59bf983626d3e546dcf05e074ae5aacac82720f6fb0`, 416 files, `unzip -t`: *No errors detected* `[E:baseline-zip.sha256, baseline-zip-integrity.txt]` |
| Tree vs archive | `diff -rq` of the extracted archive against the working tree (excluding `node_modules`, `.next`, `tsconfig.tsbuildinfo`): **0 differences** at the start of this task |
| Source revision | None available (not a git repository, no commit id). The archive sha256 is the identity |
| Environment | Ubuntu 24.04.5 LTS, Linux 6.18.44 x86_64, Node v22.22.0, npm 10.9.4 |
| Prisma (manifest) | `prisma` 6.2.1 and `@prisma/client` 6.2.1 exact-pinned in `package.json`; installed packages report 6.2.1 / 6.2.1 (read from `package.json` files, because the CLI itself cannot start) |
| Package manager | npm, `package-lock.json` present; `npm ci --ignore-scripts --dry-run` under npm 10.9.4 exits 0 on the final lockfile `[E:npm-ci-dry-run-npm10.log]` |
| Project commands | lint `npm run lint` (= `eslint . --ext .ts,.tsx`), types `npm run typecheck` (= `tsc --noEmit`), tests `npm test` (= `vitest run`), **`npm run build` = `prisma generate && next build`** (so it is blocked by Prisma), migrations `npm run db:migrate:deploy`, HTTP suite `node scripts/http-verification/run.mjs`. There is no `npm audit` script; `npm audit` was run directly. The drift command is the one documented in `docs/DATABASE_MIGRATIONS.md` (`prisma migrate diff …`) |
| Outstanding blockers at baseline | (1) Prisma CLI 403 (all five Prisma commands); (2) genuine-client HTTP run; (3) real AI / email / storage / billing unexercised |

## 2. Authoritative Prisma 6.2.1 verification — BLOCKED

All five pinned commands were run again in this task, with no bypass, mirror, checksum suppression or substitute engine `[E:prisma-commands-retry.txt, prisma-version-403.log]`:

| Command | Exit | Output (first line) |
|---|---|---|
| `npx prisma --version` | 1 | `Failed to fetch sha256 checksum at https://binaries.prisma.sh/all_commits/4123509d…/debian-openssl-3.0.x/libquery_engine.so.node.sha256 - 403 Forbidden` |
| `npx prisma validate` | 1 | same 403 (`libquery_engine.so.node.gz.sha256`) |
| `npx prisma generate` | 1 | same 403 (`libquery_engine.so.node.sha256`) |
| `npx prisma migrate deploy` (empty disposable DB name; never reached) | 1 | same 403 (`schema-engine.sha256`) |
| `npx prisma migrate diff --from-migrations … --to-schema-datamodel … --shadow-database-url … --exit-code` | 1 | same 403 (`libquery_engine.so.node.gz.sha256`) |

The generated client file `node_modules/.prisma/client/index.js` was md5-verified unchanged after these attempts. Root cause: environment/network policy, not code. The sandbox egress proxy reports `gateway answered 403 to CONNECT (policy denial or upstream failure)` for `binaries.prisma.sh:443`; `PRISMA_ENGINES_MIRROR`, `PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING` and `PRISMA_QUERY_ENGINE_LIBRARY` are unset (I did not set them). No authorised network-enabled CI runner is available to me.

| Required gate | Status |
|---|---|
| `prisma --version`, `validate`, `generate` | **BLOCKED** |
| `prisma migrate deploy` on a fresh disposable Postgres (genuine engine) | **BLOCKED** |
| Documented drift command with a disposable shadow DB (genuine engine) | **BLOCKED** |
| `tsc --noEmit` with a *freshly, genuinely generated* client | **BLOCKED** (the `tsc` run below uses the client already in `node_modules/.prisma`, which I did not generate and which is md5-unchanged) |
| `npm run build` (includes `prisma generate`) | **BLOCKED**; only `next build` alone was run (§4) |
| CLI/client/engine compatibility; generated client + library query engine actually functioning | **NOT VERIFIED** |
| HTTP suite with the normal generated client and production library engine, no preload | **BLOCKED / NOT RUN** |

## 3. Database and migration integrity — substitute evidence only

Migrations (checksums unchanged since the Pre-5C gate, so no existing migration was rewritten): `20261009000000_baseline_modules_1_4` sha256 `328990e1…`, `20261010120000_add_business_ai_preferences` `a85750ea…`, `20261011120000_add_business_memories` `02603ca4…`. A scan of the two incremental migrations finds **0** `DROP TABLE/COLUMN/TYPE/INDEX`, `TRUNCATE` or `DELETE FROM` statements (5 and 7 statements) `[E:migration-destructive-scan.txt]`. In the baseline, the 43 lines matching `DROP|TRUNCATE|DELETE` are `deletedAt` columns/indexes and `ON DELETE` foreign-key clauses; **0** lines begin with `DROP`, `TRUNCATE` or `DELETE`. This is a text scan, not a semantic review.

**SUBSTITUTE harness** (`scripts/migration-verification`: Prisma's schema engine **6.19.0** as WebAssembly + `@prisma/adapter-pg` 7.10.0 with two scratch patches, against real PostgreSQL 16 on disposable databases). It is a stand-in, not the pinned 6.2.1 engine; SQL generation could differ between versions. Results this run:

| Check (substitute) | Exit | Result |
|---|---|---|
| `apply.mjs` fresh DB | 0 | the 3 migrations applied in order `[E:sub-apply.log]` |
| `drift.mjs` live DB → `schema.prisma` | 0 | no difference `[E:sub-drift-live.log]` |
| `drift.mjs` migrations (shadow DB) → `schema.prisma` | 0 | no difference `[E:sub-drift-migrations.log]` |
| `existing.mjs` pre-5B install **with data** → migrations | 0 | baseline matches existing tables, marked applied without executing; the two 5B migrations applied; pre-existing tables byte-for-byte unchanged; no drift afterwards `[E:sub-existing-install.log]` |
| `validate.cjs` (`prisma-schema-wasm` from the engines commit pinned by 6.2.1) | 0 | 27 models, 20 enums `[E:sub-validate.log]` |
| `vitest src/lib/__tests__/migration-history.test.ts` | 0 | 10/10 |

**Limitations stated explicitly:** none of this is the authoritative gate. The existing-install rehearsal uses a synthetic pre-5B database with test rows, not representative production data; **production-data migration safety is not established**. Constraint/index/default/nullability consistency is covered only by the drift comparison above, not by an independent constraint-by-constraint audit.

## 4. Local gates on the final tree (all re-run after the last source change)

| Command | Exit | Result |
|---|---|---|
| `npx tsc --noEmit` | 0 | no errors (client already in `node_modules/.prisma`; see §2) `[E:tsc.log]` |
| `npx eslint . --ext .ts,.tsx` | 0 | 0 bytes of output: no errors, no warnings `[E:eslint.log]` |
| `npx vitest run` (Redis suite skipped) | 0 | 52 files, 682 tests: **674 passed, 8 skipped, 0 failed**. The 8 skipped are the real-Redis suite, reported as skipped, not passed `[E:vitest-no-redis.*]` |
| `REDIS_INTEGRATION_URL=<disposable Redis 7.0.15> npx vitest run` | 0 | 52 files, 682 tests: **682 passed, 0 skipped, 0 failed** `[E:vitest-with-redis.*]` |
| `rm -rf .next && npx next build` (env file with dummy provider keys and a placeholder database name; the build only needs the variables to validate) | 0 | success; CSS sha256 `8a432b11…b169f` unchanged |
| `node scripts/http-verification/run.mjs` on a freshly started server (old process killed) | 0 | **135/135 passed, 0 failed, 0 skipped** (§5) |
| `npm audit --omit=dev` | 0 | 0 vulnerabilities |
| `npm audit` | 1 | 8 high, 0 critical, all dev-only (§7) |

**First Redis run failed and is disclosed:** one `REDIS_INTEGRATION_URL` run exited 1 with 0 test failures and 7 skipped because the disposable Redis was not running at that moment (the suite aborted in its connection `beforeAll`; Redis uptime was 53 s when I checked, i.e. it was restarted afterwards). The log is kept `[E:vitest-redis-attempt1-FAILED-redis-was-down.log]`; I re-ran with Redis confirmed up (676/676 at that point in the task) and the final run above, after the last source change, is 682/682.

**Emissions despite exit 0 (investigated):** the build log prints 2 `PrismaClientInitializationError: could not locate the Query Engine for runtime "debian-openssl-3.0.x"` messages during "Collecting page data"/static generation `[E:next-build.log]`. Cause: the repository's generated client has no engine in this environment (§2). I did not identify which module queries the database at build time. **The build therefore cannot be called verified**; re-check that the messages disappear (or are expected connection errors) in an environment with a genuine `prisma generate`.

**Mocked vs real in the unit suites:** vitest suites use test doubles for Prisma/Next cookies/loggers as labelled in each file; the real-Redis suite uses real ioredis. The doubles are not counted as integration results.

## 5. Real-database HTTP verification

**Actual count: 135 checks** (the earlier "127" is stale; the suite grew by 8 this run: 2 attribution + 6 malformed-JSON). Per section `[E:http-FINAL-135-checks.log]`: Authentication 25 (includes 5 public pages, revoked-cookie redirect chain, token revocation), Workspaces/businesses 5, RBAC 4 (+ matrix), Workspace/business isolation 9, **Identity-header trust 26**, AI preferences 11, Memory 22, Malformed/oversized 25, AI execution safe-failure 4, Redis rate limiting 4. Passed 135, failed 0, skipped 0, blocked 0, not-run 0.

**This run is a SUBSTITUTE-ENGINE run, not a genuine-client integration result.** The server ran with the real routes, middleware, session/RBAC code and SQL against a real disposable PostgreSQL 16 and a real Redis 7, but Prisma was served by a *separate* client (`driverAdapters` preview) on the **WASM query engine shipped inside `@prisma/client` 6.2.1** plus `@prisma/adapter-pg` 6.2.1, injected with `NODE_OPTIONS=--require …/preload.cjs` (`scripts/http-verification/setup-wasm-client.cjs`). The brief forbids counting that as the genuine gate, so **the genuine-client HTTP gate remains BLOCKED**. Provider, email and storage credentials were fake; TEAM_MEMBER/CLIENT memberships were inserted by SQL (invites are emailed).

Coverage mapped to §7 of the brief:
- **Sessions/claims:** unauthenticated; valid; garbage, tampered, payload-swapped, expired, wrong-secret and alg=none tokens (HTTP); wrong issuer, wrong audience and missing `sessionId` (unit, real jose); revoked-by-logout, all-sessions-deleted, expired session row, deactivated user, JWT-says-SUPER_ADMIN-but-DB-USER, promoted-after-login (HTTP).
- **Identity headers:** forged four headers with no cookie (fabricated, victim's real userId/email, attacker's own session ids), with each invalid-cookie class, with a valid session of a *different* user; header-name case variations are covered at middleware unit level (mixed case), not over HTTP (the fetch client lower-cases names).
- **Authorization/tenancy:** workspace membership, cross-workspace and cross-business (IDOR) reads and writes, RBAC matrix, legitimate SUPER_ADMIN cross-workspace access, SUPER_ADMIN audit attribution, no data written by forged requests.
- **AI:** preferences and memory authorization/scoping/validation, safe provider-failure envelope, tenant-scoped execution, real-Redis rate limiting.
- **Excluded routes/webhooks:** `src/app/api/webhooks` and the `admin`, `billing`, `projects`, `team`, `uploads` directories under `api/v1` contain **no files** (checked with `find -type f`). Nothing can be exercised there; no identity header is read anywhere, so the middleware matcher's `api/webhooks` exclusion does not weaken any check. Any future webhook must authenticate by signature.

## 6. Defects found in this run, with evidence and fixes

| # | Severity | Confirmed defect | Fix (file) | Regression test | Before → after |
|---|---|---|---|---|---|
| D1 | HIGH | **SUPER_ADMIN actions were attributed to the workspace owner, and `POST /leave` by a SUPER_ADMIN removed the owner's membership.** `requireWorkspaceAccess`'s SUPER_ADMIN bypass returned the workspace *owner's* id/email/name; every route uses `workspaceUser.id` as the actor for audit logs, `createdById`/`updatedById`, invite sender and membership operations (46-route inventory below). Reproduced over HTTP on the unmodified build: memory created by the SUPER_ADMIN had `createdById` = audit `actorId` = owner's id; `POST /leave` on a two-admin workspace returned `200 {"left":true}` and the owner's `workspace_members` row count became 0 | `src/lib/middleware/require-auth.ts`: the bypass now loads the workspace id and the SUPER_ADMIN's **own** user row and returns that identity (ADMIN-equivalent workspace role unchanged) | `require-auth.test.ts` (+2: own identity never the owner's, unknown workspace → NOT_FOUND; mutation `id: "owner_1"` makes it fail); HTTP +2 checks | 2 failing HTTP checks `[E:http-BEFORE-attribution-fix-129-checks.log]` → 135/135 |
| D2 | MEDIUM | **Malformed or empty JSON bodies returned 500 `INTERNAL_ERROR` (and logged "Unhandled API error")** on the 20 route files that call `await req.json()` directly, including 5 public routes (login, signup, forgot-password, contact, demo-generate). No information leak, but a client error reported as a server fault | `src/lib/api-response.ts` `handleRouteError`: `SyntaxError` whose message mentions JSON → `400 VALIDATION_ERROR` "The request body must be valid JSON." (parser text not echoed); other errors unchanged | `src/lib/__tests__/api-response-malformed-json.test.ts` (6; removing the branch fails 4); HTTP +6 | 6 failing HTTP checks `[E:http-BEFORE-malformed-json-fix-135-checks.log]` → 135/135 |
| D3 | HIGH (advisory) | **New production advisory** appeared in `npm audit --omit=dev` between runs with an unchanged lockfile: `follow-redirects` 1.16.0 (GHSA-q3jh-wrc6-jgq8, GHSA-8r9p-f939-6h3c: credential-header leakage across redirects), path `razorpay@2.9.5 → axios@1.20.0 → follow-redirects`. `razorpay` is not imported anywhere in `src/` (billing handlers do not exist) | lockfile-only update `npm update follow-redirects --package-lock-only --ignore-scripts` then `npm install --ignore-scripts`: **exactly one lock entry changed (1.16.0 → 1.16.1)**, `package.json` byte-identical | whole suite re-run (§4); `npm ci --dry-run` under npm 10 OK | `--omit=dev`: 1 high → 0 |

Note: `npm install` reported "changed 3 packages" while the lock diff shows only `follow-redirects`; I did not identify the other two installed-state differences. The full gate set was re-run afterwards and the generated client file's md5 was unchanged.

Preserved and re-verified (not assumed): the previous identity-header remediation (cookie-verified identity, DB-authoritative role/email/active-state, header stripping in `src/middleware.ts` via `src/lib/middleware/identity-headers.ts`, 26 HTTP checks + 32 unit tests in `src/lib/middleware`), the `Button asChild` fix (`src/components/ui/__tests__/button.test.ts`, 3 tests; public pages 200 over HTTP), the revoked-cookie redirect-loop fix, and the 5B preferences/memory behaviour. Existing tests were not edited to be weaker; the previous `requireWorkspaceAccess` SUPER_ADMIN unit test was updated only because the function now (correctly) reads the caller's user row instead of `workspace.owner`.

## 7. Security audit

**Scope inspected (all of it, no exclusions):** all **46** `route.ts` files under `src/app/api` (generated inventory `[E:route-inventory.md]`, then manual review of the 8 without a session helper); all `(app)` pages (guarded by `getWorkspaceUserOrRedirect` in the workspace layout or `requireAuth`), `src/app/dashboard/page.tsx`, `src/app/onboarding/page.tsx`, `src/app/(auth)/layout.tsx`; `src/middleware.ts`, `src/lib/middleware/{require-auth,identity-headers,require-business}.ts`, `src/modules/auth/{session,service,repository}.ts`, the activity/audit service, `src/lib/api-response.ts`. There are **no server actions** (`"use server"`: 0 files). The inventory's "permission guard" column is regex-derived (it also matched the word in `leave/route.ts`'s comment, which intentionally has no permission guard); it is a map for review, not a proof.

Findings by the brief's checklist:
- **Client-supplied identity headers:** no code reads them (`grep` finds only comments, the strip list and tests). PASS.
- **Missing authentication:** 38 routes call `requireAuth`/`requireAuthUser`/`requireWorkspaceAccess` directly; the other 8 are public by design: signup, login, forgot-password, reset-password, verify-email (credential/token based), contact, `ai/demo-generate` (validates input and returns `FEATURE_NOT_AVAILABLE`; it calls no provider, so there is no anonymous cost path), and `auth/logout` (acts only on the *verified* cookie's own session). PASS.
- **Cross-tenant / IDOR:** HTTP-verified (9 isolation checks + forged-header variants). PASS for the exercised paths.
- **Role source / stale claims:** `requireAuth` takes role/email/active-state from the database. **Middleware role check:** `src/middleware.ts` still gates `/admin` from the JWT role, which can be stale. Classification: **documented, non-blocking limitation** — `src/app/admin` and `src/app/api/v1/admin` contain no files, so nothing is reachable through that gate; a future admin handler must call `requireAuth()` and check its DB role (documented in the middleware header and `docs/ARCHITECTURE.md`; a dedicated `requirePlatformAdmin()` was deliberately not added because it would be unused code today).
- **SUPER_ADMIN audit attribution:** **genuine defect (D1), fixed and regression-tested.**
- **Session revocation/expiry:** HTTP-verified (logout, delete-all, expired row, deactivated user, demotion).
- **Sensitive info in logs/errors:** the generic handler returns a fixed message with no stack; the logger has a `redact` configuration; auth logs record only user/session ids (no tokens/passwords); safe-failure checks confirm no key or stack in provider-error bodies. I did not audit every log call in the codebase.
- **Non-blocking observations, not changed (no exploit demonstrated, outside "fix only reproducible defects"):** (a) `auth/login` stores the first `x-forwarded-for` value as the session's `ipAddress`; that header is client-controlled unless a trusted proxy overwrites it, so treat the stored IP as informational and configure the proxy; it is not used for any authorization decision. (b) `GET /api/v1/auth/logout` changes state on GET (logout CSRF; SameSite=Lax permits top-level navigation) — low severity, pre-existing, used by a menu link. (c) The 20 legacy routes that call `req.json()` have no application-level body size cap (the 5B routes do); rely on a platform/proxy limit or add the shared capped reader in a follow-up.

## 8. Dependency audit

| Scope | Result |
|---|---|
| Production (`npm audit --omit=dev`) | **0 vulnerabilities** `[E:npm-audit-omit-dev.json]` (after the D3 lock bump; it was 1 high before) |
| All (`npm audit`) | **8 high, 0 critical**: `@next/eslint-plugin-next`, `braces` (GHSA-vfj7-8cjw-p6xm, no patched release), `chokidar`, `eslint-config-next`, `fast-glob`, `micromatch`, `tailwindcss`, `tailwindcss-animate`. All resolve to `dev: true` lockfile entries (build/lint tooling; not shipped). Fixes: none for `braces`/`chokidar`/`tailwindcss*`; `eslint-config-next@14.2.35` is a semver-major downgrade, rejected. **Deferred**, dispositions unchanged from `PRE_5C_FINAL_CLOSURE_REPORT.md`; no Tailwind major migration, nothing downgraded or removed `[E:npm-audit-all.json]` |
| Dependency changes made | one lockfile entry, `follow-redirects` 1.16.0 → 1.16.1 (D3); validated by the full gate re-run and `npm ci --dry-run` |

I do not claim the dependency tree is vulnerability-free.

## 9. Verified vs unverified

| Area | Status |
|---|---|
| Auth/session/RBAC/tenancy/identity-header behaviour, AI preferences & memory, rate limiter, public pages | **Verified** over real HTTP + real Postgres + real Redis, **on the substitute Prisma client** (§5) |
| Authoritative Prisma gates; genuine generated client; production library query engine; `npm run build` | **BLOCKED / UNVERIFIED** |
| Migration chain and drift | **Substitute-verified only** (§3) |
| Live AI-provider calls | **UNVERIFIED** — fake key, no provider egress; only the safe failure path (502 `PROVIDER_ERROR`, no key/stack) is proven |
| Email delivery, object storage/uploads, billing/payment flows | **UNVERIFIED** — never exercised (`razorpay` is a dependency but unused in `src/`) |
| Production credentials, deployment | **UNVERIFIED** |
| Browser-level visual/responsive checks | **NOT RUN** (only status codes and redirects were checked) |
| External callbacks/webhooks | **No handlers exist**; nothing to verify |

## 10. Files changed in this run

Source: `src/lib/middleware/require-auth.ts` (D1), `src/lib/api-response.ts` (D2), `package-lock.json` (D3, one entry).
Tests/scripts: `src/lib/middleware/__tests__/require-auth.test.ts`, new `src/lib/__tests__/api-response-malformed-json.test.ts`, `scripts/http-verification/run.mjs` (129 → 135 checks).
Docs: `scripts/http-verification/README.md` (135 checks), `docs/ARCHITECTURE.md` (SUPER_ADMIN identity note), `docs/history/PRE_5C_RELEASE_GATE_REPORT_2026-10-18.md` (the superseded report, preserved), this report, `docs/evidence/pre5c-final-gate/*`; `docs/evidence/pre5c-security/*` re-scrubbed of database URLs.
Unchanged: Prisma schema, all migrations (checksums above), `package.json`.

## 11. Remaining blockers and exact next steps

1. **Authoritative Prisma gates** — (superseded by §12.4; the workflow replaces this manual list) run in an environment authorised to reach `binaries.prisma.sh` (or an approved, pinned internal mirror): `npm ci --ignore-scripts && npx prisma --version && npx prisma validate && npx prisma generate`; `DATABASE_URL=<fresh empty disposable db> npx prisma migrate deploy`; the drift command from `docs/DATABASE_MIGRATIONS.md` with a disposable shadow DB (expect exit 0); `npx tsc --noEmit && npm run build` (expect the two build-time `Query Engine` messages to be gone or explained).
2. **Genuine-client HTTP run** — `npm start` **without** `NODE_OPTIONS`, then `SESSION_SECRET=<server's secret> node scripts/http-verification/run.mjs` (expect 135/135). Until then the HTTP result is substitute-engine evidence.
3. **Representative upgrade test** — rehearse the three migrations on a copy of real (sanitised) pre-5B data before any production deploy.
4. **Live integrations** — an authorised provider key and egress for one real generation; email, storage and billing smoke tests in a staging environment.
5. **KILLCRITIC review** of D1/D2/D3, the non-blocking observations in §7, and the decision on a dedicated admin guard before the first `/admin` handler. Do not start Module 5C before the Prisma gates are closed and that review is complete.

## 12. Addendum: authorised CI verification workflow (prepared, NOT executed)

**No CI run exists. The workflow below has not been executed by anyone, and I cannot execute it** (this sandbox has no GitHub Actions access and the Prisma engine host is policy-blocked). Every Prisma, genuine-client, `npm run build` and genuine-HTTP gate in §2 therefore remains **BLOCKED / NOT RUN**. Nothing in this addendum converts a blocked gate into a pass.

### 12.1 What was prepared

`.github/workflows/pre5c-release-gate.yml` (verification only, `contents: read`, no secrets required, no deploy) and `scripts/ci/*`, documented in `PRE_5C_CI_VERIFICATION_GUIDE.md` (requirements, variables, triggering, stages, Prisma-access troubleshooting, DB safety, failed-check vs blocker triage). It runs, in order and stopping on the first required failure: env-guard (no preload, no engine override, no checksum suppression) → source digest → `npm ci` (normal lifecycle scripts) → versions → disposable DBs → `prisma --version/validate/generate` → genuine-client static check → `migrate deploy` → genuine-client runtime check (no adapter) → drift with shadow DB → existing-install rehearsal → `tsc` → lint → full vitest with real Redis (skipped tests fail the gate) → `npm run build` → production start with `NODE_OPTIONS` unset → `scripts/http-verification/run.mjs` → production and full `npm audit` (reported separately) → audit policy. Logs are redacted and uploaded even on failure. `SUMMARY.md` lists per-gate PASS / FAIL / NOT RUN with actual counts and never assigns the release verdict.

### 12.2 Checks actually executed for this addendum (evidence in `docs/evidence/pre5c-ci-prep/`)

| Check | Result |
|---|---|
| `actionlint` 1.7.12 on the workflow | 0 findings (re-run after the step reorder below) |
| YAML parse + "no `${{ }}` expression inside any `run:` block" | OK |
| `scripts/ci/selftest.sh` against a disposable local PG16 (`selftest.log`) | 31 passed, 0 failed (gate exit-code/`info`/pipefail semantics; secret and DB-URL redaction; env-guard rejections; digest determinism; audit-policy pass and 3 fail cases using the committed final audit JSONs; vitest-completeness; write-env; db create/drop and 3 refusals). The first run of this file had **1 failure caused by the local PG server being down**; it passed after restarting the server. The log kept is the passing re-run |
| New vitest file `src/lib/__tests__/ci-scripts.test.ts` | 30 tests; mutation-checked (removing the loopback guard or the skipped-test check makes them fail) |
| `tsc --noEmit` / `npm run lint` | exit 0 / exit 0 (`tsc.log`, `eslint.log`, `exit-codes.txt`) |
| Full `vitest run` with `REDIS_INTEGRATION_URL` → real Redis 7.0.15 | **712 passed, 0 failed, 0 skipped** (`vitest-with-redis.json`; 682 earlier + 30 new) |
| Production `next start` with the env file written by `write-env.sh`, `NODE_OPTIONS` unset | became ready (401 on unauthenticated `/api/v1/auth/me`), `/proc/<pid>/environ` had no `NODE_OPTIONS`; with `SESSION_SECRET` removed the start failed fast with exit 1. **This ran on the sandbox's pre-existing generated client, not a freshly generated one, and exercised no database query** |

**Defect found and fixed during this work (workflow bug, not app code):** the runtime genuine-client check asserts that `users`, `sessions` and `business_memories` exist, but it was ordered *before* `migrate deploy`, so it would have failed on a healthy tree. It now runs after the deploy.

Not re-run because application source and the Prisma schema/migrations are unchanged: `next build`, the 135-check HTTP suite (the §5 results stand as substitute-engine evidence).

### 12.3 Not verified (needs a real authorised CI run)

The workflow end to end; `npm ci` with lifecycle scripts; all Prisma 6.2.1 commands; `assert-genuine-client.mjs` success paths; `existing-install-rehearsal.mjs` (drives the real CLI; code-reviewed and syntax-checked only); `postgres:16.4` / `redis:7.2.5` service containers and health checks; HTTP suite on the genuine client; live `npm audit` against the current advisory database; artifact upload. First-run script bugs in these areas are plausible and would be fixed, not worked around. Actions are referenced by tag (`@v4`), not by commit SHA; pinning is a documented hardening step. CI validation on synthetic data does **not** prove migration safety on production data.

### 12.4 Updated next steps (replaces §11 item 1 and 2 as the way to close them)

1. Run `pre5c-release-gate` on a runner that can reach `binaries.prisma.sh` (or an approved pinned mirror in the `PRISMA_ENGINES_MIRROR` variable). Do not use `--ignore-scripts` as a substitute for a working Prisma install.
2. Attach the evidence artifact, record the verdict, and send for KILLCRITIC review. Items 3 to 5 of §11 are unchanged. Module 5C is not started.

## 13. Addendum 2: action supply-chain pinning (2026-10-23). Still NOT executed on CI

Verdict unchanged: `ENVIRONMENT-UNVERIFIED — CI EXECUTION OR REQUIRED GATES BLOCKED`. No GitHub Actions run exists, so every Prisma, genuine-client, build, migration/drift and genuine-HTTP gate remains BLOCKED / NOT RUN. Static checks below do not substitute for them.

Executed in this pass (real exit codes in `docs/evidence/pre5c-ci-pins/exit-codes.txt`): `actionlint` 0; `verify-action-pins.mjs` online 0 and `--offline` 0 (the three tags `actions/checkout` v4.4.0, `actions/setup-node` v4.4.0, `actions/upload-artifact` v4.6.2 resolve upstream to exactly the pinned full SHAs; also confirmed by fetching each commit and by each GitHub release page); `selftest.sh` 0 (33 passed, 0 failed); `tsc` 0; `eslint` 0; full `vitest` with real Redis 0 (715 passed, 0 failed, 0 skipped; `assert-vitest` 0). Mutation checks: re-introducing `@v4` made the verifier exit 1 and one vitest test fail; altering one hex digit of a SHA made the online verifier exit 1.

Defect found and fixed (CI, not app): the raw server log was written inside the uploaded evidence directory; it now lives in `$RUNNER_TEMP`, outside it. This was verified only by running `start-app.sh` locally (no `*.raw.log` in the evidence directory), not on a runner.

Remaining limitations: all three pinned actions use the `node20` action runtime and newer majors were not evaluated; service images remain tag-pinned; no CODEOWNERS/Dependabot yet; whether the runner can fetch the pinned SHAs is unproven until a real run. See guide §9 and §12. Application behaviour, Prisma schema, migrations and dependencies are unchanged. Module 5C is not started.
