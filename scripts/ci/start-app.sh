#!/usr/bin/env bash
# Start the PRODUCTION build (`next start`) on the normal generated Prisma client and wait until it answers. Usage:
#   scripts/ci/start-app.sh <env-file> [port]
# NODE_OPTIONS is explicitly unset for the server process (no preload, no substitute client) and that is verified from
# /proc/<pid>/environ. The RAW server log goes to ${RUNNER_TEMP:-/tmp}/mm-ci/server.raw.log, deliberately OUTSIDE the evidence
# directory that is uploaded, so an unredacted log can never be uploaded; the finalize step writes the redacted copy to logs/server.log.
set -euo pipefail
envfile="${1:?env file}"; port="${2:-3101}"
evid="${CI_EVIDENCE_DIR:?}"; state="${RUNNER_TEMP:-/tmp}/mm-ci"; mkdir -p "$evid/logs" "$state"
[ -f .next/BUILD_ID ] || { echo "no production build found (.next/BUILD_ID): run the build gate first" >&2; exit 1; }
( set -a; . "$envfile"; set +a; unset NODE_OPTIONS; exec node node_modules/next/dist/bin/next start -p "$port" ) > "$state/server.raw.log" 2>&1 < /dev/null &
pid=$!; echo "$pid" > "$state/server.pid"
echo "server pid $pid; waiting for http://127.0.0.1:$port"
for i in $(seq 1 90); do
  kill -0 "$pid" 2>/dev/null || { echo "server exited early" >&2; tail -n 40 "$state/server.raw.log" | node "$(dirname "$0")/redact.mjs" >&2; exit 1; }
  code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port/api/v1/auth/me" || true)"
  [ "$code" = "401" ] && { echo "ready after ${i}s (unauthenticated /api/v1/auth/me -> 401 as expected)"; break; }
  [ "$i" = 90 ] && { echo "server not ready after 90s (last status: $code)" >&2; tail -n 40 "$state/server.raw.log" | node "$(dirname "$0")/redact.mjs" >&2; exit 1; }
  sleep 1
done
if tr '\0' '\n' < "/proc/$pid/environ" | grep -q '^NODE_OPTIONS='; then echo "FAIL: server process has NODE_OPTIONS set (possible client preload)" >&2; exit 1; fi
echo "server process environment has no NODE_OPTIONS: genuine client, no preload"
