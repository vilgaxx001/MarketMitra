#!/usr/bin/env bash
# Write a PRODUCTION-VALID env file for the disposable CI app (build + server). Usage:
#   SESSION_SECRET=... DATABASE_URL=... REDIS_URL=... scripts/ci/write-env.sh <output-file> [port]
# Contains NO real credential: provider/email values are inert placeholders (the HTTP suite proves the SAFE provider-failure
# path, never generation), storage is local, and the only secret (SESSION_SECRET) is generated per run by the workflow.
# The file is written outside the evidence directory with mode 600 and is never uploaded.
set -euo pipefail
out="${1:?output file}"; port="${2:-3101}"
: "${SESSION_SECRET:?}" "${DATABASE_URL:?}" "${REDIS_URL:?}"
[ "${#SESSION_SECRET}" -ge 32 ] || { echo "SESSION_SECRET must be >= 32 characters" >&2; exit 2; }
umask 077
cat > "$out" <<ENV
NODE_ENV=production
PORT=${port}
APP_URL=http://localhost:${port}
DATABASE_URL=${DATABASE_URL}
DIRECT_URL=${DATABASE_URL}
SESSION_SECRET=${SESSION_SECRET}
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_ci_placeholder_not_a_credential
EMAIL_FROM='noreply@example.test'
AI_PROVIDER=openai
OPENAI_API_KEY=sk-ci-placeholder-not-a-credential-000000
STORAGE_PROVIDER=local
REDIS_URL=${REDIS_URL}
# The HTTP suite plays the trusted edge: it sends each simulated client address in x-real-ip. Without a trusted source the app
# treats every client as one shared bucket (see docs/RATE_LIMITING.md). Default rate-limit policy, deny-on-Redis-failure not set.
TRUSTED_IP_HEADER=x-real-ip
NEXT_TELEMETRY_DISABLED=1
ENV
echo "wrote $out (placeholders only; mode 600)"
