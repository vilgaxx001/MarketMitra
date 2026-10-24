# Migrations

Full procedures, the verification evidence and its limits: **`docs/DATABASE_MIGRATIONS.md`**. Summary:

| Directory | Purpose |
|---|---|
| `20261009000000_baseline_modules_1_4` | Baseline for Modules 1-4 (25 tables, 16 enums). Generated from the Module 5A schema. |
| `20261010120000_add_business_ai_preferences` | Module 5B.1, additive (2 enums, 1 table). |
| `20261011120000_add_business_memories` | Module 5B.2, additive (2 enums, 1 table). |

- **Fresh database:** `npx prisma migrate deploy`.
- **Existing database created with `db push`:** do NOT run the baseline. `npx prisma migrate resolve --applied 20261009000000_baseline_modules_1_4`, then `npx prisma migrate deploy`.
- **Rules:** never edit an applied migration (checksummed); never put semicolons in migration comments (some drivers split scripts on them); add new migrations instead of altering old ones.
- **Check:** `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url <url> --exit-code` must exit 0.

The migrations were verified on a real PostgreSQL 16 through Prisma's schema engine run as WebAssembly (not through the `prisma` 6.2.1 CLI, whose engine download was blocked). The CLI commands above are unexecuted in this repository's history and must be run once in a networked environment.
