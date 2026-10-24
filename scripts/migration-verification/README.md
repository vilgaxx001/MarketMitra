# Migration verification harness (NOT part of the application)

Why this exists: in the environment where the Pre-5C gate was run, `prisma validate|generate|migrate` could not run (the Prisma CLI downloads
its engines from a host that was blocked, HTTP 403). This harness drives Prisma's **own** engines as npm-delivered WebAssembly instead, against a
real, disposable PostgreSQL. It is a stand-in, not a replacement: **in any environment that can download Prisma's engines, run the real CLI commands in
`docs/DATABASE_MIGRATIONS.md` and treat those as authoritative.**

Differences from the real CLI (all material, keep in mind when reading results):
- `@prisma/schema-engine-wasm` is **6.19.0**, not 6.2.1 (the version pinned by the project). SQL generation could differ between versions; the baseline was
  therefore also checked for drift in the reverse direction (live DB -> schema) and by a positive control (an injected extra column is detected).
- `@prisma/adapter-pg@7.10.0` is used with two scratch patches (`patch-adapter.mjs`): unknown pg system type OIDs map to Text, and the shadow-database
  pool is closed before `DROP DATABASE`. The patches only affect this directory's `node_modules`.
- The adapter splits migration scripts on `;`, so **migration comments must not contain semicolons**.
- Schema validation / DMMF use `@prisma/prisma-schema-wasm` from the exact engines commit pinned by prisma 6.2.1.

## Setup and use
```bash
cd scripts/migration-verification
npm ci && node patch-adapter.mjs
export PGURL=postgresql://USER:PASS@127.0.0.1:PORT/EMPTYDB     # a DISPOSABLE database

node validate.cjs ../../prisma/schema.prisma /tmp/dmmf.json     # schema validation (requires NODE_PATH=$PWD/node_modules)
node apply.mjs  "$PGURL" ../../prisma/migrations                 # fresh DB: apply the history in order
node drift.mjs  "$PGURL" ../../prisma/schema.prisma              # live DB vs schema  (exit 0 = no drift, 2 = drift)
node drift.mjs  "$PGURL" ../../prisma/schema.prisma ../../prisma/migrations "postgresql://.../SHADOWDB"   # migrations vs schema
node diff-empty.mjs "$PGURL" fixtures/schema-modules-1-4.prisma  # regenerate baseline SQL from the Modules 1-4 schema
node existing.mjs "$PGURL" fixtures/schema-modules-1-4.prisma ../../prisma/schema.prisma ../../prisma/migrations   # existing-install rehearsal
NODE_PATH=$PWD/node_modules node gen-client.cjs ../.. /tmp/client-out   # typed client WITHOUT a query engine (types only)
```
Never point these scripts at a database that holds data you care about: `apply`, `existing` and the shadow database create and drop objects.
