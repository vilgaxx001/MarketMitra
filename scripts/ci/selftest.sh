#!/usr/bin/env bash
# Local self-test of the CI helper scripts. It does NOT run Prisma, the build, the HTTP suite or the workflow, and it proves nothing
# about them. It checks that the helpers fail closed. Optional disposable PostgreSQL checks run only when SELFTEST_PG_BASE is set:
#   SELFTEST_PG_BASE=postgresql://postgres@127.0.0.1:54329 MM_CI_LOCAL_DISPOSABLE=1 scripts/ci/selftest.sh
# Audit-policy cases use the committed evidence JSONs in docs/evidence/pre5c-final-gate/.
set -uo pipefail
cd "$(dirname "$0")/../.."
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
pass=0; fail=0
expect() { # expect <name> <expected-exit> <command...>
  local name="$1" want="$2"; shift 2
  "$@" >"$tmp/out" 2>&1; local got=$?
  if [ "$got" = "$want" ]; then echo "PASS  $name (exit $got)"; pass=$((pass+1)); else echo "FAIL  $name (exit $got, expected $want)"; sed 's/^/        /' "$tmp/out" | tail -5; fail=$((fail+1)); fi
}
E=docs/evidence/pre5c-final-gate
export CI_EVIDENCE_DIR="$tmp/ev" CI_REDACT_VARS=SESSION_SECRET SESSION_SECRET=selftest-secret-0123456789abcdef0123456789
unset NODE_OPTIONS PRISMA_ENGINES_MIRROR PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING PRISMA_QUERY_ENGINE_LIBRARY

echo "# gate.sh"
expect "gate required pass keeps 0" 0 scripts/ci/gate.sh g1 required -- 'echo ok'
expect "gate required fail returns the real exit code" 7 scripts/ci/gate.sh g2 required -- 'exit 7'
expect "gate info fail does not fail the step" 0 scripts/ci/gate.sh g3 info -- 'exit 3'
expect "gate pipefail: failure at the start of a pipe is not hidden" 1 scripts/ci/gate.sh g4 required -- 'false | cat'
expect "gate rejects an empty command" 2 scripts/ci/gate.sh g5 required --
if [ "$(awk -F'\t' '$1=="g3"{print $3}' "$tmp/ev/gates.tsv")" = 3 ]; then echo "PASS  info gate records the REAL exit code (3) in gates.tsv"; pass=$((pass+1)); else echo "FAIL  info gate exit code not recorded"; fail=$((fail+1)); fi
scripts/ci/gate.sh g6 required -- 'echo "$SESSION_SECRET postgresql://u:pw@h:5432/d"' >/dev/null 2>&1
if grep -rqE "selftest-secret|pw@h" "$tmp/ev"; then echo "FAIL  secret or DB URL leaked into the evidence directory"; fail=$((fail+1)); else echo "PASS  secret and DB URL absent from logs and gates.tsv"; pass=$((pass+1)); fi

echo "# env-guard.sh"
expect "env-guard ok on a clean environment" 0 env -i PATH="$PATH" scripts/ci/env-guard.sh
expect "env-guard rejects NODE_OPTIONS" 1 env -i PATH="$PATH" NODE_OPTIONS="--require /x.cjs" scripts/ci/env-guard.sh
expect "env-guard rejects checksum suppression" 1 env -i PATH="$PATH" PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1 scripts/ci/env-guard.sh
expect "env-guard rejects an engine override" 1 env -i PATH="$PATH" PRISMA_QUERY_ENGINE_LIBRARY=/x scripts/ci/env-guard.sh
expect "env-guard rejects an http:// mirror" 1 env -i PATH="$PATH" MIRROR_VAR=http://m.example scripts/ci/env-guard.sh
expect "env-guard rejects a mirror with credentials" 1 env -i PATH="$PATH" MIRROR_VAR=https://u:p@m.example scripts/ci/env-guard.sh
expect "env-guard accepts an https mirror" 0 env -i PATH="$PATH" GITHUB_ENV="$tmp/ghenv" MIRROR_VAR=https://mirror.example.com/prisma scripts/ci/env-guard.sh

echo "# source-digest.mjs"
d1="$(node scripts/ci/source-digest.mjs)"; d2="$(node scripts/ci/source-digest.mjs)"
if [ -n "$d1" ] && [ "$d1" = "$d2" ]; then echo "PASS  digest is deterministic"; pass=$((pass+1)); else echo "FAIL  digest not deterministic"; fail=$((fail+1)); fi

echo "# audit-policy.mjs (committed final audit JSONs)"
expect "policy passes: production 0, only the 8 reviewed dev-only advisories" 0 node scripts/ci/audit-policy.mjs $E/npm-audit-omit-dev.json $E/npm-audit-all.json scripts/ci/audit-deferred.json package-lock.json
python3 - "$E" "$tmp" <<'PY'
import json,sys
E,T=sys.argv[1:3]
a=json.load(open(E+"/npm-audit-all.json")); a["vulnerabilities"]["evil-pkg"]={"name":"evil-pkg","severity":"high","nodes":["node_modules/evil-pkg"]}; a["metadata"]["vulnerabilities"]["total"]+=1; json.dump(a,open(T+"/new.json","w"))
p=json.load(open(E+"/npm-audit-omit-dev.json")); p["metadata"]["vulnerabilities"]["total"]=1; p["vulnerabilities"]={"next":{"severity":"high"}}; json.dump(p,open(T+"/prod.json","w"))
json.dump({},open(T+"/empty.json","w"))
PY
expect "policy fails on a new advisory" 1 node scripts/ci/audit-policy.mjs $E/npm-audit-omit-dev.json "$tmp/new.json" scripts/ci/audit-deferred.json package-lock.json
expect "policy fails on a production vulnerability" 1 node scripts/ci/audit-policy.mjs "$tmp/prod.json" $E/npm-audit-all.json scripts/ci/audit-deferred.json package-lock.json
expect "policy fails when the audit did not run (empty JSON)" 1 node scripts/ci/audit-policy.mjs "$tmp/empty.json" $E/npm-audit-all.json scripts/ci/audit-deferred.json package-lock.json

echo "# verify-action-pins.mjs (offline format check; upstream resolution needs network and is run separately)"
expect "committed workflow: every action pinned by full SHA with tag comment" 0 node scripts/ci/verify-action-pins.mjs --offline
mkdir -p "$tmp/unpinned/.github/workflows" "$tmp/unpinned/scripts/ci"
cp scripts/ci/verify-action-pins.mjs "$tmp/unpinned/scripts/ci/"
printf 'jobs:\n  j:\n    steps:\n      - uses: actions/checkout@v4\n' > "$tmp/unpinned/.github/workflows/w.yml"
expect "a tag-pinned (unpinned) action is rejected" 1 node "$tmp/unpinned/scripts/ci/verify-action-pins.mjs" --offline

echo "# assert-vitest.mjs"
expect "complete run with 0 skipped passes" 0 node scripts/ci/assert-vitest.mjs $E/vitest-with-redis.json
expect "run with skipped (Redis) tests fails" 1 node scripts/ci/assert-vitest.mjs $E/vitest-no-redis.json
expect "missing report fails" 1 node scripts/ci/assert-vitest.mjs "$tmp/none.json"

echo "# assert-genuine-client.mjs (negative paths)"
expect "static check fails with a preload configured (it also fails here for the missing engine, so this is not a discriminating test)" 1 env NODE_OPTIONS="--require /x.cjs" node scripts/ci/assert-genuine-client.mjs static
expect "static check fails with checksum suppression set (same caveat)" 1 env PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1 node scripts/ci/assert-genuine-client.mjs static

echo "# write-env.sh"
expect "write-env rejects a short SESSION_SECRET" 2 env SESSION_SECRET=short DATABASE_URL=postgresql://x REDIS_URL=redis://x scripts/ci/write-env.sh "$tmp/e.env"
expect "write-env writes a file" 0 env SESSION_SECRET="$SESSION_SECRET" DATABASE_URL=postgresql://postgres@127.0.0.1:5432/mm_ci_fresh REDIS_URL=redis://127.0.0.1:6379 scripts/ci/write-env.sh "$tmp/e.env"
if [ "$(stat -c %a "$tmp/e.env")" = 600 ]; then echo "PASS  env file mode is 600"; pass=$((pass+1)); else echo "FAIL  env file mode"; fail=$((fail+1)); fi

if [ -n "${SELFTEST_PG_BASE:-}" ]; then
  echo "# db.mjs against a DISPOSABLE local PostgreSQL ($(printf '%s' "$SELFTEST_PG_BASE" | sed -E 's#//[^@]*@#//<redacted>@#'))"
  expect "db create + drop of mm_ci_* names" 0 env MM_CI_PG_BASE="$SELFTEST_PG_BASE" bash -c 'node scripts/ci/db.mjs create mm_ci_selftest_a mm_ci_selftest_b && node scripts/ci/db.mjs drop mm_ci_selftest_a mm_ci_selftest_b'
  expect "db refuses a non-mm_ci name" 3 env MM_CI_PG_BASE="$SELFTEST_PG_BASE" node scripts/ci/db.mjs drop marketmitra
  expect "db refuses a non-loopback host" 3 env MM_CI_PG_BASE=postgresql://postgres@10.1.2.3:5432 node scripts/ci/db.mjs drop mm_ci_x
  expect "db refuses without a CI/disposable marker" 3 env -u MM_CI_LOCAL_DISPOSABLE -u GITHUB_ACTIONS MM_CI_PG_BASE="$SELFTEST_PG_BASE" node scripts/ci/db.mjs drop mm_ci_x
else
  echo "# db.mjs checks SKIPPED (SELFTEST_PG_BASE not set)"
fi
echo; echo "selftest: $pass passed, $fail failed"
[ "$fail" = 0 ]
