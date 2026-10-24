# Real-service HTTP verification (not application code, not run by vitest)

`run.mjs` drives a RUNNING MarketMitra server over HTTP against a real, migrated, DISPOSABLE PostgreSQL and a real Redis (135 checks):
public pages, authentication and session revocation (including a revoked cookie not causing a redirect loop), **forged identity-header attacks** (`x-user-id` / `x-session-id` / `x-user-email` / `x-platform-role` with no cookie, invalid / tampered / expired / wrong-secret / alg=none cookies, and the attacker's own valid session ids + forged SUPER_ADMIN), SUPER_ADMIN actions attributed to the SUPER_ADMIN (not the workspace owner), malformed-JSON bodies on public and legacy routes answering 400, database-authoritative roles (demoted / promoted / deactivated / expired-row users, legitimate SUPER_ADMIN),  RBAC for ADMIN / TEAM_MEMBER / CLIENT, workspace and business isolation (including IDOR attempts with
foreign business and memory ids), AI preferences and memory CRUD against the database, malformed / oversized / chunked / invalid-UTF-8 bodies,
the AI execute route with a safe provider-error path, and the Redis rate limiter through the real HTTP path.
It is kept separate from the mocked unit tests (`src/**/*.test.ts`) on purpose. It writes workspace membership rows for the two lower roles directly
in SQL (team invites are delivered by email, which cannot be sent here) and otherwise only uses the public API.

**Real vs substitute.** With the Prisma engines downloadable, run the app normally (`npm run db:migrate:deploy`, `npm run build`, `npm start`) and skip
`setup-wasm-client.cjs`. Where they are not (the case in which this was first run), `setup-wasm-client.cjs` builds a SEPARATE client with
Prisma 6.2.1's own WASM query engine (shipped inside `@prisma/client`) and `@prisma/adapter-pg` 6.2.1 and injects it only into the server process through
`NODE_OPTIONS=--require`. That exercises the real routes, middleware, RBAC and SQL, but it is NOT the library query engine the production build uses.

```bash
# 0. disposable services: an EMPTY Postgres database and a Redis you do not care about
( cd scripts/migration-verification && npm ci && node patch-adapter.mjs )
( cd scripts/migration-verification && node apply.mjs "$PGURL" ../../prisma/migrations )          # or: npx prisma migrate deploy
# 1. (only if the Prisma engines cannot be downloaded)
node scripts/http-verification/setup-wasm-client.cjs /tmp/mm-wasm
export NODE_OPTIONS="--require /tmp/mm-wasm/preload.cjs"
# 2. a production build and server with PRODUCTION-VALID env (see docs/SETUP.md), pointing at the disposable DB/Redis, e.g. port 3101
npm run build   # or: npx next build
DATABASE_URL="$PGURL" REDIS_URL=redis://127.0.0.1:63799 AI_PROVIDER=openai OPENAI_API_KEY=sk-test-not-real SESSION_SECRET=... APP_URL=http://localhost:3101 \
  STORAGE_PROVIDER=local EMAIL_PROVIDER=resend RESEND_API_KEY=re_test_not_real EMAIL_FROM=noreply@example.test node node_modules/next/dist/bin/next start -p 3101
# 3. the suite. SESSION_SECRET is REQUIRED and must equal the server's: the suite signs expired / wrong-secret tokens to prove they are rejected
BASE_URL=http://127.0.0.1:3101 PGURL="$PGURL" REDIS_URL=redis://127.0.0.1:63799 SESSION_SECRET=... node scripts/http-verification/run.mjs --out results.json
```

Not covered: a real provider call with an authorised key (the run uses a fake key and an environment with no provider egress, so it proves the SAFE failure path, not generation),
email delivery, S3 uploads, billing, browser rendering.
The suite exits 2 without `PGURL` or `SESSION_SECRET`. Always restart the server after rebuilding: a stale process serves the old route code.
Never point `PGURL`/`REDIS_URL` at data you care about (the script creates rows and `flushall` is recommended before runs).
