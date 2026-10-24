# Change log: authorised CI verification workflow (Pre-5C)

Baseline: `marketmitra-app-pre5c-final-gate-closure.zip`, sha256 `10aee0b6c0f47a9f3a0a5eca25c0174a53e104f93bd311397ef6411d8ae5bf02`, 447 files.
Application source (`src/` except one new test file), the Prisma schema, all migrations, `package.json` and `package-lock.json` are **unchanged**; no dependency was added. Because no application file changed, `next build` and the 135-check HTTP suite were not re-run.

Nothing here has been executed on CI. See `PRE_5C_CI_VERIFICATION_GUIDE.md` and `PRE_5C_RELEASE_GATE_REPORT.md` §12.

## Added

| File | Why |
|---|---|
| `.github/workflows/pre5c-release-gate.yml` | The verification workflow: ordered stages, `contents: read`, no secrets, no deploy, service containers, redacted logs uploaded with `if: always()` |
| `scripts/ci/gate.sh` | Runs one gate with `pipefail`, keeps and records the real exit code, redacts output, fails the step for `required` gates; `info` records the real code without failing |
| `scripts/ci/redact.mjs` | Removes the per-run secret value, `postgres://` URLs, bearer tokens and API-key shapes from logs and the logged command text (artifact upload does not honour `::add-mask::`) |
| `scripts/ci/env-guard.sh` | First gate: fails on `NODE_OPTIONS`, engine overrides, checksum suppression; validates the optional https `PRISMA_ENGINES_MIRROR` variable |
| `scripts/ci/source-digest.mjs` | Deterministic source-tree SHA-256 (sorted per-file hashes; excludes `node_modules`, `.next`, `.git`, `.ci-evidence`, `tsconfig.tsbuildinfo`) |
| `scripts/ci/lib/db-safety.mjs` | Single guard for destructive DB work: loopback host, `mm_ci_*` name, CI marker (or explicit local opt-in) |
| `scripts/ci/db.mjs` | Creates/drops the disposable `mm_ci_*` databases through the guard |
| `scripts/ci/write-env.sh` | Writes a production-valid, placeholder-only env file (mode 600) for build and server; no real credential |
| `scripts/ci/assert-genuine-client.mjs` | Proves the normal generated client and library query engine are in use and work (static and runtime modes); rejects preloads, engine overrides, version mismatches |
| `scripts/ci/existing-install-rehearsal.mjs` | Drives the real Prisma CLI through the documented existing-install path (`db push` fixture, seed, diff, `migrate resolve --applied`, `migrate deploy`) and checks data and drift, on synthetic data only |
| `scripts/ci/assert-vitest.mjs` | Fails unless the vitest JSON shows a complete run with 0 failed/skipped/todo tests and 0 failed files (a skipped Redis suite must not count as a pass) |
| `scripts/ci/audit-policy.mjs`, `scripts/ci/audit-deferred.json` | Explicit audit gate: production must be 0; only the 8 reviewed dev-only advisories may remain; new, higher-severity or non-dev findings fail; deferred findings are printed as not fixed |
| `scripts/ci/start-app.sh`, `scripts/ci/stop-app.sh` | Start the production server with `NODE_OPTIONS` unset (verified from `/proc`), wait for readiness, stop only that pid |
| `scripts/ci/summarize.mjs` | Builds `SUMMARY.md` / `summary.json` from what was recorded; missing gates are `NOT RUN`; never assigns the release verdict |
| `scripts/ci/selftest.sh` | Local fail-closed self-test of the helpers (31 checks); does not run Prisma or the workflow |
| `src/lib/__tests__/ci-scripts.test.ts` | 30 vitest tests of the helpers' decision logic so a regression in a guard fails the normal suite |
| `PRE_5C_CI_VERIFICATION_GUIDE.md` | Requirements, variables (names only), triggering, stages, artifacts, Prisma-access troubleshooting, DB safety, failure-vs-blocker triage, hardening |
| `PRE_5C_CI_CHANGE_LOG.md` | This file |
| `docs/evidence/pre5c-ci-prep/*` | Logs of the checks actually executed for this work: `actionlint.log`, `selftest.log`, `tsc.log`, `eslint.log`, `vitest-with-redis.{log,json}`, `exit-codes.txt` |
| `docs/history/PRE_5C_RELEASE_GATE_REPORT_2026-10-22_before-ci-workflow.md` | Preserved copy of the report before this task's edits |

## Modified

| File | Change and why |
|---|---|
| `PRE_5C_RELEASE_GATE_REPORT.md` | Headline verdict set to `ENVIRONMENT-UNVERIFIED — CI EXECUTION OR REQUIRED GATES BLOCKED` (previous verdict noted); §11 item 1 marked superseded; new §12 addendum listing only executed checks and what still needs a real run. §1-§11 otherwise unchanged |
| `.gitignore` | Added `.ci-evidence/` so run output is never committed |

## Defect found and fixed while building (workflow, not app)

The runtime genuine-client check requires migrated tables but was ordered before `migrate deploy`. The workflow now runs it after the deploy (and `summarize.mjs` lists the gates in the same order).

## Not changed on purpose

No change to `package.json` (e.g. no `npm audit` or CI script added), no secrets, no `.env` file, no weakened security assertion, no new mirror, no change to Prisma pins or engines.

---

# Change log, pass 2: action supply-chain hardening

Baseline: `marketmitra-app-pre5c-ci-workflow.zip`, sha256 `83cef9a148a54e2592354e0ddad5880177e98be0592c3bf09fef5b2501a8226b`, 475 files, source digest `8e01193165ae11c23338973cd863cab9ae7d5fbede9b63d2b84577059c7e44c7` (re-extracted and re-verified at the start of this pass; the working tree matched it). Application source, Prisma schema, migrations, `package.json`, `package-lock.json` and dependency versions are **unchanged**.

## Modified

| File | Change and why |
|---|---|
| `.github/workflows/pre5c-release-gate.yml` | `actions/checkout@v4`, `actions/setup-node@v4`, `actions/upload-artifact@v4` replaced by full-SHA pins with the tag in a comment (`11d5960a…` v4.4.0, `49933ea5…` v4.4.0, `ea165f8d…` v4.6.2), each verified against github.com (guide §9). The Finalize step now reads the raw server log from `$RUNNER_TEMP/mm-ci/` instead of the evidence directory (below). Permissions, triggers, services, step order, gates and fail-closed behaviour are otherwise unchanged |
| `scripts/ci/start-app.sh` | Raw (unredacted) server log is written to `${RUNNER_TEMP:-/tmp}/mm-ci/server.raw.log` instead of `$CI_EVIDENCE_DIR/logs/`. **Defect fixed:** the evidence directory is uploaded with `if: always()`, so an unredacted log there could reach the artifact if the Finalize step did not complete. It is now never inside the uploaded directory |
| `scripts/ci/selftest.sh` | +2 checks (committed workflow passes the offline pin check; a tag-pinned workflow is rejected): 31 to 33 |
| `src/lib/__tests__/ci-scripts.test.ts` | +3 vitest tests for the pin verifier (30 to 33 in this file); includes a guard that the committed workflow stays SHA-pinned |
| `PRE_5C_CI_VERIFICATION_GUIDE.md` | New §9 with the pins, verification method and remaining limitations (node20 runtime, checkout v4.4.0 breaking change scope, service images still tag-pinned); §2 and §12 updated |
| `PRE_5C_CI_CHANGE_LOG.md` | This section |
| `PRE_5C_RELEASE_GATE_REPORT.md` | New §13 addendum; verdict unchanged |

## Added

| File | Why |
|---|---|
| `scripts/ci/verify-action-pins.mjs` | Fails on any non-SHA action reference, missing tag comment, or a pin that no longer matches the upstream tag; `--offline` is format-only. Never guesses a SHA |
| `docs/evidence/pre5c-ci-pins/*` | Logs and exit codes of this pass: `actionlint`, pin verifier (online and offline), `selftest`, `tsc`, `eslint`, vitest with Redis, `assert-vitest`, a mutation check of the verifier, and the relocated-log start test |

## Unresolved

None of the three actions is unresolved. Not done: Docker image digests for the service containers, CODEOWNERS, Dependabot for actions, evaluation of newer action majors.
