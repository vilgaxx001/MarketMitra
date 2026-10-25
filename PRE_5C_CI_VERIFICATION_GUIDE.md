# MarketMitra: Pre-5C CI Verification Guide

**Status of this workflow:** executed on GitHub Actions. Run 4 (`40193097977`, commit `c851f6bb31bbdfcd39c25897245c16be6bca6041`) passed all 19 required gates; runs 1 to 3 failed for reasons that were fixed (see "Run history" below and `PRE_5C_RELEASE_GATE_REPORT.md` §14). That run's evidence artifact has still to be read by the final reviewer.

The workflow only **verifies**. It never deploys, publishes, pushes, tags or writes to any environment other than its own throw-away services.

---

## 1. What it proves, and what it does not

It runs the previously blocked gates on the pinned **Prisma 6.2.1** CLI, the **normal generated client** and the **normal library query engine**: no WASM preload, no substitute client, no checksum suppression, no `--ignore-scripts`.

It does **not** prove: migration safety on production data (only synthetic, disposable data is used; rehearse on a sanitised copy of real data before any production deploy), live AI/email/storage/billing behaviour (the HTTP stage uses inert placeholder keys and proves only the safe failure path), browser/visual behaviour, or the absence of all dependency advisories (8 reviewed **dev-only** advisories are deferred, not fixed; see §7).

## 2. Provider, runner and service requirements

| Requirement | Value |
|---|---|
| CI provider | GitHub Actions |
| Runner | `ubuntu-24.04` (GitHub-hosted, or a self-hosted runner you control that offers the same toolchain and Docker for service containers) |
| Node.js / npm | Node **22.22.0** (set by `actions/setup-node`); npm = the version bundled with it (10.9.x). `package.json` requires Node `>=20` |
| PostgreSQL | service container `postgres:16.4`, trust auth, on `127.0.0.1:5432`, destroyed with the job |
| Redis | service container `redis:7.2.5` on `127.0.0.1:6379` |
| Network egress | `binaries.prisma.sh:443` (Prisma engines), `registry.npmjs.org` (install and `npm audit`), `github.com` (actions), Docker Hub or your registry mirror (service images) |
| Job limit | 45 minutes; one run per ref at a time (a newer run cancels an older one for the same ref) |
| Third-party actions | exactly three, each **pinned by full commit SHA** (see §9): `actions/checkout` `11d5960a…` (v4.4.0), `actions/setup-node` `49933ea5…` (v4.4.0), `actions/upload-artifact` `ea165f8d…` (v4.6.2) |

The authoring sandbox verified against PostgreSQL 16 and Redis 7.0.15; CI uses `postgres:16.4` and `redis:7.2.5`. Minor-version differences are possible, so the CI run is the authority.

## 3. Secrets and variables (names only)

| Name | Kind | Required | Purpose |
|---|---|---|---|
| *(none)* | secret | **No secret is required.** | The session secret is generated per run (`openssl rand -hex 32`, masked, never uploaded); database auth is trust-on-loopback; provider keys are inert placeholders |
| `PRISMA_ENGINES_MIRROR` | repository **variable** | No | Only if your organisation blocks `binaries.prisma.sh` and has approved a pinned internal mirror. Must be a plain `https://` URL (no credentials, query or fragment). Prisma still verifies checksums |

Do **not** create secrets for database passwords or provider keys for this workflow, and never set `NODE_OPTIONS`, `PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING`, `PRISMA_QUERY_ENGINE_LIBRARY`, `PRISMA_QUERY_ENGINE_BINARY`, `PRISMA_SCHEMA_ENGINE_BINARY` or `PRISMA_CLIENT_ENGINE_TYPE` as variables/secrets or in the runner image: the first gate (`env-guard`) fails the run if any is present, including a `NODE_OPTIONS` such as `--use-openssl-ca` that a corporate runner image may set. If your runner legitimately needs one, fix the runner image rather than weakening the guard.

## 4. How to trigger it

* **Manually:** repository → *Actions* → `pre5c-release-gate` → *Run workflow* (branch of your choice).
* **Automatically:** every pull request targeting `main`.
* For public repositories, set *Settings → Actions → General → Fork pull request workflows* to require approval for outside collaborators: a pull request runs the PR's own code and its own copy of the workflow. The workflow holds no secrets and a read-only token, which limits but does not remove that exposure.

## 5. Stages (in order; the first failing required stage stops the run)

All required stages go through `scripts/ci/gate.sh`, which preserves the real exit code, redacts logs and appends a row to `gates.tsv`.

| Id | Stage | Required | Expected on success |
|---|---|---|---|
| A0 `env-guard` | no client/engine substitution, no checksum suppression, mirror (if any) is https | yes | `env-guard OK` |
| A1 | source SHA-256 digest, commit, tool versions (`environment.txt`, `source-files.sha256`) | n/a | digest recorded |
| A2 | per-run `SESSION_SECRET` | n/a | masked |
| A3 `npm-ci` | `npm ci` with normal lifecycle scripts (`HUSKY=0` only disables git-hook install) | yes | exit 0 |
| A4 `harness-npm-ci` | `npm ci --prefix scripts/migration-verification` (supplies the `pg` client used by `scripts/ci` and the HTTP suite; the harness's WASM engine is **not** used by this workflow) | yes | exit 0 |
| A5 | Prisma CLI / client / engine versions recorded | n/a | 6.2.1 / 6.2.1 / engines commit `4123509d…` |
| A6 `db-create` | create `mm_ci_fresh`, `mm_ci_shadow`, `mm_ci_existing` after name + loopback + CI-marker checks | yes | `created database …` |
| B1–B3 | `prisma --version`, `validate`, `generate` | yes | exit 0 |
| B4 `genuine-client-static` | a real `libquery_engine-*.so.node` (>1 MiB) next to the generated client; no `driverAdapters` flag | yes | all PASS |
| B5 `prisma-migrate-deploy` | `prisma migrate deploy` on the fresh DB | yes | 3 migrations applied |
| B6 `genuine-client-runtime` | client = CLI = pin; engine commit matches; `new PrismaClient()` (no adapter) round-trips `SELECT 1` and sees `users`, `sessions`, `business_memories` (so it runs **after** the deploy) | yes | all PASS |
| B7 | `prisma migrate status` | info | "Database schema is up to date" |
| B8 `prisma-drift` | documented drift command with the shadow DB, `--exit-code` | yes | exit 0 (no difference) |
| B9 `existing-install-rehearsal` | pre-5B install with synthetic data: `db push` of the modules 1-4 fixture, seed, `migrate diff`, `migrate resolve --applied 20261009000000_baseline_modules_1_4`, `migrate deploy`, row/md5 comparison, final drift = 0 | yes | exit 0 |
| B10 `tsc` | `npx tsc --noEmit` | yes | exit 0 |
| D1 `lint` | `npm run lint` | yes | exit 0 |
| D2 `vitest-with-redis` | full suite incl. the real-Redis integration suite; **any skipped, todo or failed test or file fails the gate** | yes | N passed, 0 skipped |
| B11–B12 `build` | production-valid placeholder env, then `npm run build` (= `prisma generate && next build`) | yes | exit 0 |
| C1 `app-start` | `next start` with `NODE_OPTIONS` unset (verified from `/proc/<pid>/environ`), ready when unauthenticated `/api/v1/auth/me` returns 401 | yes | ready |
| C2 `http-suite` | `node scripts/http-verification/run.mjs` on the genuine client; actual counts are read from `http.json` | yes | all checks pass |
| E1–E2 | `npm audit --omit=dev` and `npm audit` (JSON saved; reported separately) | info | raw exit codes recorded |
| E3 `audit-policy` | production must be 0; only the reviewed dev-only advisories in `scripts/ci/audit-deferred.json` may remain | yes | `AUDIT POLICY: PASS` |
| Finalize (always) | stop server, redact server log, drop `mm_ci_*` DBs, write `SUMMARY.md` / `summary.json`; its exit code fails the job unless **every** required gate recorded exit 0 and test/HTTP results exist | n/a | RESULT line |
| Upload (always) | artifact `pre5c-gate-evidence-<run_id>-<attempt>` (14 days) | n/a | uploaded |

The HTTP stage makes one real outbound HTTPS attempt to the AI provider with an inert placeholder key to prove the 502 `PROVIDER_ERROR` failure path; no provider credential is involved.

## 6. Inspecting results

1. Open the run → the job **Summary** page shows the same table as `SUMMARY.md`.
2. Download artifact `pre5c-gate-evidence-<run_id>-<attempt>`:
   * `SUMMARY.md`, `summary.json`: per-gate PASS / FAIL / NOT RUN, actual test and HTTP counts, audit result.
   * `gates.tsv`: `id, level, exit, start, end, command` for every gate that ran.
   * `logs/<gate>.log`: redacted output of each gate; `logs/server.log` the redacted app log.
   * `vitest.json`, `http.json`, `audit-prod.json`, `audit-all.json`, `audit-policy.json`, `genuine-client-static.json`, `genuine-client-runtime.json`, `existing-install-rehearsal.json`.
   * `environment.txt` (versions, commit, source digest) and `source-files.sha256` (per-file hashes).
3. Counts are what the run reported: **do not assume 135 HTTP checks or any test total**; read `http.json` / `vitest.json`. A gate with no row is `NOT RUN` (the workflow stopped earlier); a skipped test is never counted as passed.
4. Compare `environment.txt`'s source digest with `node scripts/ci/source-digest.mjs` run on the tree you intended to verify.

## 7. Dependency audit (E)

Production and full audits are saved separately. **Expected from the last local audit (not re-run in CI):** production 0; full 8 high, all dev-only (`braces` is the root cause; no patched release exists). They are listed in `scripts/ci/audit-deferred.json` with reasons and printed as `DEFERRED (dev-only, NOT fixed)`. A **new** advisory, a severity above `high`, a non-dev install path, or any production finding **fails** `audit-policy`. Because advisories change daily, a failure here can be a genuinely new advisory rather than a code change: triage it, then fix the dependency or add a reviewed entry with a reason; never loosen the policy to get green.

## 8. Troubleshooting: Prisma access

| Symptom in `prisma-version` / `npm-ci` / `prisma-generate` logs | Meaning | Action |
|---|---|---|
| `Failed to fetch sha256 checksum at https://binaries.prisma.sh/… - 403 Forbidden` | **Environment blocker**: egress policy denies `binaries.prisma.sh` | Allow `binaries.prisma.sh:443` for the runner, **or** have security approve and pin an internal https mirror and set the `PRISMA_ENGINES_MIRROR` repository variable. Re-run |
| `CONNECT … 403`, `ECONNRESET`, `ETIMEDOUT`, `getaddrinfo ENOTFOUND` to `binaries.prisma.sh` | Environment blocker (proxy/DNS/firewall) | Same as above; check runner proxy settings |
| `Checksum mismatch` / `sha256 … does not match` | Mirror content differs from the official engine for commit `4123509d…` | Fix the mirror. **Never** set `PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING` or otherwise skip verification |
| `env-guard` fails | A forbidden variable is present | Remove it from the runner image/org variables; do not edit the guard |
| `libquery_engine … not found` after a successful `generate` | Engine platform not detected/downloaded | Check the `prisma-generate` log; this is not a code defect unless `prisma/schema.prisma` `binaryTargets` was changed |

Do not retry with another command, a different registry, or a hand-copied engine binary; those bypass the thing being verified.

## 9. Action supply chain: pins and what remains

**Done.** The workflow references exactly three third-party actions and no reusable workflows, Docker actions or local actions. Each is pinned by full 40-hex commit SHA with the version tag in a trailing comment:

| Action | Pin | Tag | Floating `v4` at verification time |
|---|---|---|---|
| `actions/checkout` | `11d5960a326750d5838078e36cf38b85af677262` | v4.4.0 | same commit |
| `actions/setup-node` | `49933ea5288caeca8642d1e84afbd3f7d6820020` | v4.4.0 | same commit |
| `actions/upload-artifact` | `ea165f8d65b6e75b540449e92b4886f43607fa02` | v4.6.2 | same commit |

How the pins were verified (2026-10-23): (1) `git ls-remote https://github.com/<repo>.git refs/tags/<tag>` returned exactly that SHA (all three tags are lightweight; there was no peeled entry); (2) the commit was fetched by tag and `git rev-parse FETCH_HEAD` equalled the pin; (3) the GitHub release page for each tag showed the same full SHA. The tags are lightweight, so there is no tag signature to verify; the release commits showed GitHub's "verified" badge on the release pages. Each is the latest v4.x.y release and equals the previously used floating `v4`, so the pin freezes what `@v4` already resolved to rather than changing action versions.

Re-verify at any time (needs network): `node scripts/ci/verify-action-pins.mjs` (add `--offline` for the format-only check, which also runs in the vitest suite and `selftest.sh`). It fails on any tag/branch pin, a missing tag comment, a SHA that no longer matches the tag upstream, or an unresolvable tag. It never guesses a SHA. To bump an action: resolve the new tag with `git ls-remote`, read its release notes, update the SHA **and** the comment together, run the verifier.

**Notes and remaining limitations**

* `actions/checkout` v4.4.0 is a release with a *breaking change*: it backports `allow-unsafe-pr-checkout`, which only affects workflows triggered by `pull_request_target` or `workflow_run` (verified in the pinned source: the helper returns early for any other event). This workflow uses `pull_request` and `workflow_dispatch`, so it is unaffected. **Never add `pull_request_target` or `workflow_run` triggers to this workflow.**
* All three pinned actions declare the `node20` runtime (read from `action.yml` at the pinned commits). Newer major versions exist upstream (v7 at verification time) and were **not evaluated or adopted**; moving majors is a separate, reviewed change. If GitHub retires the Node 20 action runtime on your runner generation, the run will warn or fail at action setup: that is an environment/maintenance blocker, not a code defect.
* A SHA pin protects against tag re-pointing, not against a compromised upstream repository at the time you chose the pin.
* Still recommended: `CODEOWNERS` review for `.github/workflows/` and `scripts/ci/`; Docker image digests for `postgres` and `redis` instead of tags (**not done**; service images are pulled by tag `postgres:16.4`, `redis:7.2.5`); enabling Dependabot for `github-actions` so pins are bumped by reviewed pull requests.

## 10. Safe database setup and cleanup

* All CI databases are named `mm_ci_*`, live on the job's own service container on loopback, and use trust auth: **no database password exists anywhere**.
* `scripts/ci/db.mjs` is the only destructive step (`DROP DATABASE … WITH (FORCE)` / `CREATE DATABASE`). It refuses unless the host is loopback, the name matches `^mm_ci_[a-z0-9_]{1,40}$`, and `GITHUB_ACTIONS=true` (or the explicit developer opt-in `MM_CI_LOCAL_DISPOSABLE=1`).
* The `Finalize` step drops the three databases even after failures; the service containers are destroyed with the job regardless.
* Never point `MM_CI_PG_BASE`, `DATABASE_URL` or `DIRECT_URL` at a shared, staging or production database. The scripts would refuse, but do not rely on that alone.
* To rehearse locally on **your own disposable** server:
  `SELFTEST_PG_BASE=postgresql://postgres@127.0.0.1:5432 MM_CI_LOCAL_DISPOSABLE=1 scripts/ci/selftest.sh` (helper self-test only; it does not run Prisma or the workflow).

## 11. Failed code check vs environment blocker

| Observation | Classification |
|---|---|
| Prisma 403 / mirror unreachable / checksum fetch failure / DNS or proxy error / service container did not become healthy / `npm ci` registry timeout | **Environment blocker.** Verdict stays `ENVIRONMENT-UNVERIFIED`. Fix access, re-run |
| `gates.tsv` row with `FAIL` for `prisma-validate`, `prisma-migrate-deploy`, `prisma-drift`, `existing-install-rehearsal`, `tsc`, `lint`, `vitest-with-redis` (failed tests), `build`, `http-suite` (failed checks), `audit-policy` (new/prod advisory), `genuine-client-runtime` (version mismatch or query failure) | **Code or dependency defect candidate.** Read `logs/<id>.log`; reproduce; fix; re-run. Verdict `FAIL — CODE DEFECTS REMAIN` until fixed |
| `vitest-with-redis` fails with *skipped* tests, or the Redis suite cannot connect | Environment (Redis service not healthy) **unless** the connection settings were changed in the workflow |
| `NOT RUN` rows | The run stopped earlier: look at the first FAIL |
| A gate fails only on re-run, passes on retry | Treat as flaky; investigate before trusting a green re-run. Do not add retries that hide failures |

Verdict mapping for the reviewer (never written by the workflow): all required gates exit 0 in an actual run **and** the artifact reads clean → `PASS — READY FOR FINAL KILLCRITIC REVIEW`; any code/dependency FAIL → `FAIL — CODE DEFECTS REMAIN`; anything blocked or not run → `ENVIRONMENT-UNVERIFIED — CI EXECUTION OR REQUIRED GATES BLOCKED`.

## 12. Known limits of what was checked before handover

Executed locally (evidence in `docs/evidence/pre5c-ci-prep/` and, for the action-pinning pass, `docs/evidence/pre5c-ci-pins/` with real exit codes in `exit-codes.txt`): `actionlint` on the workflow (0 findings); `scripts/ci/verify-action-pins.mjs` online and offline (exit 0); `scripts/ci/selftest.sh` (33 checks of the helper scripts' fail-closed behaviour); 33 new vitest tests for the helper logic (mutation-checked); `tsc`, `eslint`, and the full vitest suite with real Redis (715/715, 0 skipped in the latest run); production `next start` with `NODE_OPTIONS` unset and the env-file written by `write-env.sh`.

**Not verified (cannot run here):** the workflow on a real runner; `npm ci` with lifecycle scripts; every Prisma 6.2.1 command; `assert-genuine-client.mjs` success paths (its runtime check needs the migrated schema; the workflow orders it after `migrate deploy`); `existing-install-rehearsal.mjs` end to end (it drives the real CLI); the Postgres/Redis service containers and health checks; whether GitHub can fetch the three pinned action SHAs on your runner (they exist upstream, but no Actions run has resolved them); `npm audit` output against the live advisory database; artifact upload.

## 13. Run history and behaviours learned from the real runs

| Run | Commit | Result | Lesson |
|---|---|---|---|
| 1 `40123293669` | `0747982` | failure | `audit-policy` correctly failed on new advisories (`next`, `zod`); the artifact upload found nothing because `.ci-evidence/` is a **dot-directory** and `upload-artifact` >= 4.4 skips hidden files unless `include-hidden-files: true` is set |
| 2 `40123824155` | `781d693` | failure | upload fixed; `zod`/`openai` advisories remained |
| 3 `40124130633` | `c5a37ef` | failure | 18 of 19 required gates passed; only `audit-policy` failed |
| 4 `40193097977` | `c851f6b` | **success** | all 19 required gates exit 0; vitest 717/717 (0 skipped), HTTP 135/135, audit 0/0 |

* **First push into an empty repository was not indexed by Actions** (0 workflows listed although the file was present and valid). A later push touching the workflow file registered it. If a workflow does not appear after the first push, push a small change to the workflow file before debugging further. The cause on GitHub's side was not directly observable.
* **The repository's default branch is the CI branch** (`ci/pre5c-gate`) because the repository was empty. `pull_request: branches [main]` does nothing until a `main` branch exists; use *Run workflow* (`workflow_dispatch`).
* **Reading results without downloading the artifact.** The summary step prints the recorded results as check-run annotations (environment, per-gate status, vitest/HTTP counts, audit problems). Read them with `gh api repos/<owner>/<repo>/check-runs/<job_id>/annotations`. They contain only facts the run recorded; the artifact remains the primary evidence.
* **Audit results change over time.** Runs 1 to 3 failed because advisories were published after the last local audit. `audit-policy` is a required gate by design; do not loosen it to get green.
* **Source digest.** The digest is of the tracked files. A local working directory that contains git-ignored files will give a different value; compute it from `git archive <commit>` extracted to an empty directory. The digest of `c851f6b` is `5d6c8a5d3611d00dd09fd3dd7ba7771e074d352bd8b71a25ba983a74db59c28f` (449 files), identical to the value the run recorded.
* GitHub warns on every run that the three pinned actions target Node 20 and are forced to Node 24. Newer action majors have not been evaluated.
