# MarketMitra — Pre-5C Critical Security Remediation & Final Gate Report

Scope: the identity-header trust vulnerability (Task 1), full gate re-run (Task 2), the authoritative Prisma gate (Task 3), explicit remaining risks (Task 4).
Module 5C was **not** started. The project is **not** called release-ready: the authoritative Prisma gates are ENVIRONMENT-UNVERIFIED (§6).
All evidence logs are in `docs/evidence/pre5c-security/` (named below).

## 1. Result at a glance

| Gate | Status | Evidence |
|---|---|---|
| Identity-header trust vulnerability | **FIXED, regression-tested, mutation-proven** — awaiting independent KILLCRITIC review | §3, §4 |
| `npx tsc --noEmit` | **PASS** (exit 0) | §5 |
| `npx eslint . --ext .ts,.tsx` | **PASS** (exit 0, 0 errors, 0 warnings) | §5 |
| `npx vitest run` (default, Redis suite skipped) | **PASS** (exit 0) — 51 files, 674 tests: 666 passed, 8 skipped (the gated Redis suite), 0 failed | §5 |
| `REDIS_INTEGRATION_URL=… npx vitest run` (real Redis 7) | **PASS** (exit 0) — 51 files, 674 tests, 674 passed, 0 skipped | §5 |
| Production build (clean `.next`, `npx next build`) | **PASS** (exit 0); CSS sha256 `8a432b11…b169f` identical to the previous gate | §5 |
| HTTP verification suite, fresh server on the final build | **PASS** — 127/127 checks (exit 0) | §5 |
| `npm audit --omit=dev` | **PASS** — 0 vulnerabilities (exit 0) | §5 |
| `npm audit` (all) | **8 high, 0 critical — all dev-only, same single root cause (`braces`, no patched release)**; exit 1 by design; dispositions preserved, nothing removed or downgraded | §7 |
| Authoritative Prisma gates (`prisma --version`, `validate`, `generate`, `migrate deploy`, `migrate diff`) | **ENVIRONMENT-UNVERIFIED** — policy-denied 403 on `binaries.prisma.sh`; not bypassed | §6 |
| `npx tsc` / `npm run build` with the *genuine* generated client | **ENVIRONMENT-UNVERIFIED** (depends on `prisma generate`) | §6 |
| HTTP suite with the normal generated client + production query engine | **ENVIRONMENT-UNVERIFIED** — run on a substitute client (§6) | §6 |
| Real AI generation | **UNVERIFIED** (no authorised credential or provider egress) | §7 |
| Email delivery, object storage, billing | **UNVERIFIED** (never exercised) | §7 |

## 2. Findings

| # | Severity | Finding | Status |
|---|---|---|---|
| F1 | **CRITICAL** | Client-forgeable identity headers (`x-user-id`, `x-session-id`, `x-user-email`, `x-platform-role`) were trusted by `requireAuth()`. A client could choose its own platform role and cross every tenant boundary. | Fixed |
| F2 | HIGH | JWT claims were authoritative for the role: a user demoted in the database kept SUPER_ADMIN access until the token expired; a promoted user did not get it. | Fixed (role now read from the DB) |
| F3 | HIGH | A deactivated user (`isActive=false`) with a live session kept working on every route built on `requireAuth` / `requireWorkspaceAccess` (only `requireAuthUser` checked `isActive`). Found by the new tests (pre-fix: 200/200/200). | Fixed |
| F4 | HIGH (availability; pre-existing) | `/`, `/pricing`, `/features` returned **500** (`React.Children.only expected to receive a single React element child`). `<Button asChild>` passed `[leadingIcon, children, trailingIcon]` to Radix `Slot`. `button.tsx` is byte-identical in every delivery back to Module 4. Not a security issue, but release-blocking. Found by live probing, never covered by an earlier check. | Fixed |
| F5 | MEDIUM (regression from my previous session-revocation change) | A cookie whose session row was revoked (logout elsewhere, password change/reset) but whose JWT had not expired looped `/login → /dashboard → /login …` forever. Confirmed over HTTP before fixing. | Fixed |
| F6 | LOW / residual | `src/middleware.ts` still gates `/admin` by the JWT role (may be stale). There are **no** `/admin` pages or `/api/v1/admin` handlers today (both directories are empty), so nothing is exposed; any future admin handler must call `requireAuth()` and check its DB role. Documented in the middleware header and `docs/ARCHITECTURE.md`. | Accepted, documented |

Earlier deliveries: before the previous task's session-row check, the four forged headers alone were sufficient (no real session needed). That statement is from code reading only; I did not reproduce it on the older builds. Any environment that ran an earlier build should be treated as having been exposed to this issue.

## 3. F1 root cause and fix

**Root cause (two cooperating defects).**
1. `src/middleware.ts` injected the four headers from the verified JWT only when a valid cookie was present. On every other path (no cookie, invalid, expired, tampered) it returned a bare `NextResponse.next()`, forwarding any client-supplied copies untouched.
2. `requireAuth()` trusted all four headers whenever they were all present (role cast straight from `x-platform-role`). The previous task's `isSessionActive(sessionId, userId)` blocked fully fabricated identities but not the attacker's *own* valid `sessionId`/`userId` (readable from their own JWT payload) combined with a forged `x-platform-role: SUPER_ADMIN`. `requireWorkspaceAccess` has a SUPER_ADMIN bypass, so that was full cross-tenant read **and write** access.

**Reproduction (real HTTP, fresh server, disposable PG16 + Redis, unfixed build — `http-BEFORE-unfixed-build-118-checks.log`).** No cookie; headers copied from the attacker's own session plus `x-platform-role: SUPER_ADMIN`; target = another tenant's workspace:

```
GET   /businesses        -> 200      PATCH ai-preferences -> 200 (row changed in the DB)
GET   ai-preferences     -> 200      POST  ai-memories    -> 201 (rows created on the victim's business)
GET   ai-memories        -> 200      POST  ai/execute     -> 502 (passed authorization, reached the AI provider)
```
The same result with a garbage, tampered, payload-swapped, expired, wrong-secret and alg=none cookie. 11 of 118 checks failed on the unfixed build. (Fully fabricated identities and the victim's userId were already 401 thanks to the previous task's session lookup.)

**Fix (defense in depth, one authoritative path).**
- `src/lib/middleware/require-auth.ts` — `requireAuth()` no longer reads any request header. It reads the session cookie, verifies the JWT (signature, HS256 only, issuer, audience, expiry), requires `sessionId`/`userId` strings, then calls `resolveActiveSessionIdentity()`: one query joining the `sessions` row to its user (row exists, belongs to the JWT's user, unexpired, user `isActive`). `platformRole` and `email` returned to callers are the **database's**. `requireAuthUser`, `requireWorkspaceAccess` (including the SUPER_ADMIN bypass), `getAuthOrRedirect`, `getWorkspaceUserOrRedirect` are all built on it, so every one inherits the fix.
- `src/middleware.ts` + new `src/lib/middleware/identity-headers.ts` — the four headers are deleted from every request the middleware forwards (case-insensitive, all paths, logged in or not), and middleware no longer injects any identity.
- `src/modules/auth/repository.ts` / `service.ts` — `findActiveSessionIdentity` / `resolveActiveSessionIdentity` replace `findActiveSession` / `isSessionActive`.
- `src/modules/auth/session.ts` — comments corrected; `getCurrentSession()` is documented as *not* an authorization check (used only by marketing CTAs and logout).
- F5: signed-in redirect away from `/login` etc. moved from middleware (JWT only) to `src/app/(auth)/layout.tsx` (database-checked; no cookie → no DB access).
- F4: `src/components/ui/button.tsx` — with `asChild`, only the single child is rendered (icons go inside the child). Default `<button>` rendering is unchanged (tested).

**Every helper path reviewed.** `x-user-id`/`x-session-id` were consumed only by `middleware.ts` and `require-auth.ts` (grep). Inventory of all 46 API route files (`find src/app/api -name route.ts`): 38 call `requireAuth` / `requireAuthUser` / `requireWorkspaceAccess` / the active-business resolver directly. The 8 without one are public by design: `auth/signup|login|forgot-password|reset-password|verify-email` (token/credential based), `contact`, `ai/demo-generate`, and `auth/logout` (acts only on the *verified* JWT's own session). All `(app)` pages go through `getWorkspaceUserOrRedirect` (layout) or `requireAuth`. `api/webhooks/*` is excluded from middleware by the matcher; it reads no identity header, and since no code reads those headers any more, that exclusion is no longer exploitable.

**Behaviour changes to be aware of (all intended, none weaken a policy).** Role/active-state changes now take effect on the next request (previously at token expiry). One indexed `sessions JOIN users` lookup per authenticated request. Deactivated users get 401 on every route (previously only on `/auth/me`).

## 4. Regression tests and proof that they fail without the protection

**Unit tests (real jose verification, real middleware, DB/cookie doubles — labelled in each file):**
- `src/lib/middleware/__tests__/require-auth.test.ts` — 18 tests: no cookie + forged SUPER_ADMIN headers; 9 bad-cookie variants (garbage, tampered signature, payload swapped to SUPER_ADMIN, expired, wrong secret, alg=none, wrong issuer, wrong audience, missing `sessionId`) each with forged headers present and asserting **`headers()` is never read and the DB is never queried**; DB-authoritative role both ways; revoked/expired/deactivated → UNAUTHENTICATED; lookup bound to the verified pair and `isActive`; SUPER_ADMIN bypass depends on the DB role only; ordinary member role preserved.
- `src/lib/middleware/__tests__/middleware-identity-headers.test.ts` — 12 tests: the real middleware on no cookie / garbage / tampered / expired / wrong-secret / valid-cookie / public page / mixed-case header names, asserting the forwarded header-override list contains none of the four headers and that nothing is injected; existing redirects (protected → `/login`, `/admin` guard) preserved; a signed JWT on `/login` is forwarded, not redirected (loop fix).
- `src/modules/auth/__tests__/session-identity.test.ts` — 3 tests (replaces the old `session-active.test.ts`); `src/components/ui/__tests__/button.test.ts` — 3 tests.

**HTTP tests (`scripts/http-verification/run.mjs`, 118 → 127 checks, real server/PG/Redis):** forged four headers with no cookie (fabricated; victim's real userId/email; attacker's *own* valid ids) → 401 on 7 routes each (reads, writes, AI execute); six invalid-cookie classes + forged SUPER_ADMIN → 401; valid cookie + forged SUPER_ADMIN / forged victim `x-user-id` → 403 and `/auth/me` still reports the attacker; cross-business with forged headers → 404; no forged write reached the DB; page routes (anonymous → `/login`, cross-tenant page not rendered, own page 200); legitimate SUPER_ADMIN keeps cross-workspace access (Alpha 200, Beta 200, unknown 404); JWT-says-SUPER_ADMIN-but-DB-demoted → 403; promoted-after-login → 200; deactivated user → 401; expired session row → 401; revoked cookie reaches `/login` with a terminating redirect chain; live session still redirected `/login → /dashboard`; public pages 200.

**Mutation proof.**
- Unit level (`unit-mutations.txt`, script `mutations.py`; each mutation applied alone against the then-32-test auth/middleware set, then restored and checksum-verified):

| Mutation | Tests failing |
|---|---|
| U1 `requireAuth` trusts the four headers again | 16 |
| U2 role taken from JWT claims instead of the DB | 4 |
| U3 DB lookup skipped | 1 |
| U4 middleware stops stripping | 8 |
| U5 middleware re-injects identity headers | 1 |
| U6 strip list missing one header | 2 |
| U7 `isActive` dropped from the lookup | 2 |

- HTTP level (`http-MUTATED-both-layers-reverted-118-checks.log`): the pre-fix behaviour was reinstated in `middleware.ts` and `require-auth.ts` (unauthenticated pass-through + header-trusting `requireAuth`, role from header), rebuilt, fresh server, same suite → **10 checks fail** (all forged-header/invalid-cookie cases return 200 with writes landing; demoted-JWT SUPER_ADMIN gets 200; promoted-after-login gets 403). Sources were restored, `md5sum -c` OK, then rebuilt.
- Honest limit: because either layer alone blocks the attack, an HTTP-level mutation of *only one* layer does not fail the HTTP suite; the unit tests (U1, U4–U6) are what pin each layer individually. The unit mutations were run before the loop-fix test and Button test were added; the Button test was mutation-checked separately (reverting the fix reproduces the exact production error and fails 2 of 3 tests).

**After the fix** (`http-AFTER-fixed-build-127-checks.log`): fresh server on the final build, **127/127 passed**, exit 0.

## 5. Gate commands, exit codes, counts (final tree; `gate-exit-codes.txt`)

| Command | Exit | Result |
|---|---|---|
| `npx tsc --noEmit` | 0 | no errors (run again after the last lint edit) |
| `npx eslint . --ext .ts,.tsx` | 0 | 0 problems (an `_n` unused-var warning in my new test was fixed first) |
| `npx vitest run` | 0 | 51 files; 674 tests: 666 passed, 8 skipped, 0 failed |
| `REDIS_INTEGRATION_URL=redis://127.0.0.1:63799 npx vitest run` | 0 | 51 files; 674 tests: 674 passed, 0 skipped, 0 failed (was 635 at the previous gate) |
| `rm -rf .next && npx next build` (env `gate/build.env`) | 0 | success; CSS sha256 `8a432b1198ff2d1dff2e053b73f3e88211ae39ea4aed75e2e1f257ae70fb169f` (unchanged) |
| `node scripts/http-verification/run.mjs` (old server killed, fresh `next start` on that build) | 0 | **127/127** |
| `npm audit --omit=dev` | 0 | 0 vulnerabilities |
| `npm audit` | 1 | 8 high / 0 critical, dev-only (§7) |

`scripts/http-verification/README.md` updated: **127 checks** (it said 92), and it documents the new required `SESSION_SECRET` (the suite exits 2 without it, so the token-forgery checks cannot be silently skipped). `package.json` / `package-lock.json` are byte-identical to the previous delivery.
The build prints two pre-existing `Prisma Client could not locate the Query Engine` messages during static generation (identical count in the previous build log); that is the ungenerated-client condition of this environment (§6).

## 6. Authoritative Prisma gate — ENVIRONMENT-UNVERIFIED

I retried once, with no bypass, mirror or checksum suppression:

| Command | Exit | Error |
|---|---|---|
| `npx prisma --version` | 1 | `Failed to fetch sha256 checksum at https://binaries.prisma.sh/all_commits/4123509d…/debian-openssl-3.0.x/libquery_engine.so.node.gz.sha256 - 403 Forbidden` |
| `npx prisma validate` | 1 | same 403 (`schema-engine.sha256`) |
| `npx prisma generate` | 1 | same 403 (`libquery_engine…sha256`) |
| `npx prisma migrate deploy` (empty disposable DB) | 1 | same 403 |
| `npx prisma migrate diff --from-migrations … --to-schema-datamodel … --shadow-database-url … --exit-code` | 1 | same 403 (`schema-engine.gz.sha256`) |

The sandbox egress proxy reports `gateway answered 403 to CONNECT (policy denial)` for `binaries.prisma.sh:443`. I cannot grant myself that authorization. Consequently **not verified**: the pinned CLI itself, `migrate deploy` on a fresh DB with the genuine engine, the documented drift command with the genuine schema engine, `tsc`/`build` against a freshly generated genuine client, and the HTTP suite on the production library query engine.

**Substitutes actually used (none counted as closure):**
- Migration/drift evidence from earlier gates: `scripts/migration-verification` — the schema engine 6.19 WASM with a patched `@prisma/adapter-pg` 7.10 against real PostgreSQL 16. Not the pinned 6.2.1 CLI.
- HTTP suite: a separate client generated with the `driverAdapters` preview flag, run on the WASM query engine shipped inside `@prisma/client` 6.2.1 plus `@prisma/adapter-pg` 6.2.1, injected via `NODE_OPTIONS=--require` (`scripts/http-verification/setup-wasm-client.cjs`). It executes the real routes, middleware, RBAC and SQL, but it is **not** the library engine production uses. The repo's own `node_modules/.prisma/client/index.js` was md5-verified unchanged around the attempts above.
- The `tsc` and `build` results in §5 use the client already present in `node_modules/.prisma` (not regenerated here).

**Exact next action for closure** (needs an environment allowed to reach `binaries.prisma.sh`, or an internal mirror you authorise and pin): `npm ci --ignore-scripts && npx prisma --version && npx prisma validate && npx prisma generate`; `npx prisma migrate deploy` on an empty Postgres; the pinned drift command with a disposable shadow DB (`docs/DATABASE_MIGRATIONS.md`); `npx tsc --noEmit && npm run build`; then `npm start` **without** the `NODE_OPTIONS` preload and re-run `run.mjs` (expect 127/127).

## 7. Remaining risks (explicit)

- **AI generation:** no successful generation is claimed. The suite proves the SAFE failure path only (502 `PROVIDER_ERROR`, no key or stack in the body, 404 for a foreign `businessId`, 429 on the 21st call per window with real Redis) using a fake key and no provider egress. A real request needs an authorised credential and network access.
- **Email, object storage (S3), billing:** never exercised; unverified.
- **Dev-only advisories (8 high):** `@next/eslint-plugin-next, braces, chokidar, eslint-config-next, fast-glob, micromatch, tailwindcss, tailwindcss-animate` — one root cause, `braces` GHSA-vfj7-8cjw-p6xm, no patched release, reachable only through dev/build tooling; `npm audit --omit=dev` is 0. Nothing was removed or downgraded; no Tailwind major migration. Dispositions unchanged from `PRE_5C_FINAL_CLOSURE_REPORT.md`.
- **HTTP suite scope:** it ran on the WASM substitute client (§6), against fake provider/email credentials, with TEAM_MEMBER/CLIENT memberships inserted by SQL (invites are emailed, which cannot be sent here).
- **Browser rendering** beyond status codes/redirects, and load/performance of the new per-request join, were not measured.

## 8. Changed files

Source: `src/middleware.ts`, `src/lib/middleware/require-auth.ts`, **new** `src/lib/middleware/identity-headers.ts`, `src/modules/auth/{repository,service,session}.ts`, `src/app/(auth)/layout.tsx`, `src/components/ui/button.tsx`.
Tests: rewritten `src/lib/middleware/__tests__/require-auth.test.ts`; new `…/middleware-identity-headers.test.ts`, `src/modules/auth/__tests__/session-identity.test.ts` (replaces `session-active.test.ts`), `src/components/ui/__tests__/button.test.ts`; `scripts/http-verification/run.mjs`.
Docs: `docs/ARCHITECTURE.md` (new "Identity and session validity" section), `scripts/http-verification/README.md`, this report, `docs/evidence/pre5c-security/*`.
Unchanged: Prisma schema and migrations (checksums intact), `package.json`, `package-lock.json`.

## 9. Asks for the independent KILLCRITIC review

1. Confirm no code path reads an identity header (`grep -rn "x-user-id\|x-session-id\|x-user-email\|x-platform-role" src` should find only comments, the middleware strip list and tests).
2. Confirm `requireAuth` is the sole route to identity and that the 8 intentionally public routes (§3) are acceptable.
3. Decide whether a deactivated user returning 401 (rather than 403) on every route is the desired policy.
4. Decide whether to add a dedicated `requirePlatformAdmin()` before the first `/admin` handler exists (F6).
5. Run §6's next action in an authorised environment; until then the Prisma gates stay ENVIRONMENT-UNVERIFIED and the project is not release-ready. Do not start Module 5C before that review.
