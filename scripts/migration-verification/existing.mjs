// Existing-installation rehearsal: DB created WITHOUT migrations (the `db push` path) from the 5A-final schema,
// filled with representative rows, then brought onto the migration history without data loss.
import path from "node:path";
import fs from "node:fs";
import { openEngine, loadSchema, loadMigrations, NOFILTER } from "./engine.mjs";
import pg from "pg";
const [,, url, pre5bSchema, fullSchema, migDir] = process.argv;
const log = (...a) => console.log(...a);
const { engine, pool } = await openEngine(url);
// 1. db push the PRE-5B schema (simulates an installation created before migrations existed)
const push = await engine.schemaPush({ force: false, schema: loadSchema(pre5bSchema), filters: NOFILTER });
log("1. schemaPush(pre-5B schema):", JSON.stringify({ executedSteps: push.executedSteps, unexecutable: push.unexecutable, warnings: push.warnings }));
// 2. representative data
const c = new pg.Client({ host: "127.0.0.1", port: 54329, user: "postgres", database: new URL(url).pathname.slice(1) });
await c.connect();
const seed = fs.readFileSync(new URL("./fixtures/seed-existing.sql", import.meta.url), "utf8");
await c.query(seed);
const count = async () => Object.fromEntries((await c.query(`select relname t, n_live_tup from pg_stat_user_tables where relname <> '_prisma_migrations'`)).rows.map(() => []));
const tables = (await c.query(`select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' and table_name <> '_prisma_migrations' order by 1`)).rows.map((r) => r.table_name);
const snap = async () => { const o = {}; for (const t of tables) { const r = await c.query(`select count(*)::int n, md5(coalesce(string_agg(x::text, '|' order by x::text), '')) h from "${t}" x`); o[t] = `${r.rows[0].n}:${r.rows[0].h}`; } return o; };
const before = await snap();
log("2. seeded; tables with rows:", Object.entries(before).filter(([, v]) => !v.startsWith("0:")).map(([k, v]) => `${k}=${v.split(":")[0]}`).join(", "));
// 3. history diagnosis (no migrations table yet)
const list = loadMigrations(path.resolve(migDir));
const diag = await engine.diagnoseMigrationHistory({ migrationsList: list, optInToShadowDatabase: false, filters: NOFILTER });
log("3. diagnoseMigrationHistory:", JSON.stringify({ hasMigrationsTable: diag.hasMigrationsTable, history: diag.history }));
// 3b. does the baseline CONFLICT with this existing database? diff(live DB -> baseline-migrations-only) must be empty
const baselineOnly = { ...list, migrationDirectories: list.migrationDirectories.filter((m) => m.path.includes("baseline")) };
const shadowUrl = url.replace(/\/[^/]*$/, "/mm_shadow");
const conflict = await engine.diff({ from: { tag: "schemaDatasource", ...loadSchema(pre5bSchema), configDir: path.dirname(path.resolve(pre5bSchema)) }, to: { tag: "migrations", ...baselineOnly }, shadowDatabaseUrl: shadowUrl, script: true, exitCode: true, filters: NOFILTER });
log("3b. diff(existing DB -> baseline migration): exitCode", conflict.exitCode, conflict.exitCode === 0 ? "(no difference: baseline matches the existing tables)" : conflict.stdout);
// 4. mark ONLY the baseline as applied (do NOT execute it)
await engine.markMigrationApplied({ migrationName: "20261009000000_baseline_modules_1_4", migrationsList: list });
log("4. markMigrationApplied(baseline): done (baseline SQL not executed)");
// 5. apply the rest
const res = await engine.applyMigrations({ migrationsList: list, filters: NOFILTER });
log("5. applyMigrations ->", JSON.stringify(res.appliedMigrationNames));
// 6. data preserved?
const after = await snap();
let lost = 0; for (const t of Object.keys(before)) if (before[t] !== after[t]) { lost++; log("   CHANGED:", t, before[t], "->", after[t]); }
log("6. pre-existing tables byte-for-byte unchanged:", lost === 0 ? "YES" : `NO (${lost})`, "; new tables:", Object.keys(after).filter((t) => !(t in before)).join(", "));
const tablesAfter = (await c.query(`select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' and table_name <> '_prisma_migrations' order by 1`)).rows.map((r) => r.table_name);
log("6b. tables added by the 5B migrations:", tablesAfter.filter((t) => !tables.includes(t)).join(", "));
const drift = await engine.diff({ from: { tag: "schemaDatasource", ...loadSchema(fullSchema), configDir: path.dirname(path.resolve(fullSchema)) }, to: { tag: "schemaDatamodel", ...loadSchema(fullSchema) }, shadowDatabaseUrl: null, script: true, exitCode: true, filters: NOFILTER });
log("6c. drift(existing DB after migrations -> schema.prisma): exitCode", drift.exitCode);
const hist = (await c.query(`select migration_name, finished_at is not null f, applied_steps_count s from _prisma_migrations order by started_at`)).rows;
log("7. _prisma_migrations:", JSON.stringify(hist));
await c.end(); await pool.end();
