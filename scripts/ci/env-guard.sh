#!/usr/bin/env bash
# First gate. Refuses to continue if anything could substitute the Prisma client/engines or weaken checksum verification, and
# validates the OPTIONAL approved engine mirror (a repository *variable*, passed as MIRROR_VAR; never a secret, never http://).
#   MIRROR_VAR="${{ vars.PRISMA_ENGINES_MIRROR }}" scripts/ci/env-guard.sh
# If the mirror is valid it is exported to later steps via $GITHUB_ENV. Checksum validation is never disabled here or anywhere.
set -euo pipefail
bad=0
fail() { echo "FAIL: $*" >&2; bad=1; }
[ -z "${NODE_OPTIONS:-}" ] || fail "NODE_OPTIONS is set (a --require/--import preload could inject a substitute client)"
for v in PRISMA_QUERY_ENGINE_LIBRARY PRISMA_QUERY_ENGINE_BINARY PRISMA_SCHEMA_ENGINE_BINARY PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING PRISMA_CLIENT_ENGINE_TYPE PRISMA_CLI_QUERY_ENGINE_TYPE PRISMA_ENGINES_MIRROR PRISMA_BINARIES_MIRROR; do
  [ -z "${!v+x}" ] || fail "$v is set before the workflow configured anything (engine override / mirror must come only from the reviewed repository variable)"
done
mirror="${MIRROR_VAR:-}"
if [ -n "$mirror" ]; then
  case "$mirror" in
    https://*) ;;
    *) fail "PRISMA_ENGINES_MIRROR variable must start with https://";;
  esac
  case "$mirror" in
    *[[:space:]]*|*@*|*\?*|*\#*) fail "PRISMA_ENGINES_MIRROR variable must be a plain https URL with no whitespace, credentials, query or fragment";;
  esac
fi
[ "$bad" = 0 ] || exit 1
if [ -n "$mirror" ]; then
  [ -n "${GITHUB_ENV:-}" ] || { echo "GITHUB_ENV not set; cannot export mirror" >&2; exit 1; }
  echo "PRISMA_ENGINES_MIRROR=$mirror" >> "$GITHUB_ENV"
  echo "Prisma engines will be fetched from the approved mirror host: $(printf '%s' "$mirror" | sed -E 's#^https://([^/]+).*#\1#') (checksum verification stays ON)"
else
  echo "No mirror configured: Prisma engines come from the official host (binaries.prisma.sh). Checksum verification stays ON."
fi
echo "env-guard OK: no NODE_OPTIONS preload, no engine/client override, no checksum suppression"
