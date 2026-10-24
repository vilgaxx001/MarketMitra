#!/usr/bin/env bash
# Run ONE verification command, keep its real exit code, and record it. Never converts a failure into a pass.
#
#   scripts/ci/gate.sh <id> <required|info> -- <command string>
#
#   required  a non-zero exit fails this step (and therefore the workflow); the real code is recorded and returned.
#   info      the real exit code is recorded in gates.tsv but does NOT fail the step (used only where a later, explicit
#             policy step decides pass/fail, e.g. `npm audit`, whose exit 1 is expected while advisories exist).
#
# The command runs in `bash -o pipefail -c`. Its combined output is passed through scripts/ci/redact.mjs before it is
# printed or written to $CI_EVIDENCE_DIR/logs/<id>.log, and the command is logged UNEXPANDED (so a URL held in a variable
# is never echoed). Evidence: $CI_EVIDENCE_DIR/gates.tsv  (id, level, exit, start, end, command).
set -uo pipefail
id="${1:?gate id}"; level="${2:?required|info}"; shift 2
[ "${1:-}" = "--" ] && shift
cmd="$*"
[ -n "$cmd" ] || { echo "gate.sh: empty command" >&2; exit 2; }
case "$level" in required|info) ;; *) echo "gate.sh: level must be required|info" >&2; exit 2;; esac
dir="${CI_EVIDENCE_DIR:?CI_EVIDENCE_DIR must be set}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "$dir/logs"
log="$dir/logs/$id.log"
start="$(date -u +%FT%TZ)"
# the command text itself is also passed through the redactor (defence in depth: it normally holds only $VARIABLE references)
cmd_log="$(printf '%s' "$cmd" | node "$here/redact.mjs")"
{ echo "### gate: $id ($level)"; echo "\$ $cmd_log"; } | tee "$log"
bash -o pipefail -c "$cmd" 2>&1 | node "$here/redact.mjs" | tee -a "$log"
code="${PIPESTATUS[0]}"
end="$(date -u +%FT%TZ)"
echo "### exit: $code" | tee -a "$log"
printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$id" "$level" "$code" "$start" "$end" "$cmd_log" >> "$dir/gates.tsv"
if [ "$code" -ne 0 ] && [ "$level" = "required" ]; then
  echo "::error title=Required gate failed::$id exited with $code (see logs/$id.log in the evidence artifact)"
  exit "$code"
fi
exit 0
