// usage: drift.mjs <dbUrl> <schema.prisma> [migDir shadowUrl]
//  - without migDir: diff LIVE DB -> schema datamodel (what is in the DB vs the schema)
//  - with migDir:    diff MIGRATIONS (replayed on shadow DB) -> schema datamodel
import path from "node:path";
import { openEngine, loadSchema, loadMigrations, NOFILTER } from "./engine.mjs";
const [,, url, schemaFile, migDir, shadow] = process.argv;
const { engine, pool } = await openEngine(url);
const from = migDir ? { tag: "migrations", ...loadMigrations(path.resolve(migDir)) } : { tag: "schemaDatasource", ...loadSchema(schemaFile), configDir: path.dirname(path.resolve(schemaFile)) };
const res = await engine.diff({ from, to: { tag: "schemaDatamodel", ...loadSchema(schemaFile) }, shadowDatabaseUrl: shadow ?? null, script: true, exitCode: true, filters: NOFILTER });
console.log("exitCode:", res.exitCode, "(0 = no difference, 2 = difference)");
if (res.exitCode !== 0) console.log(res.stdout);
process.exitCode = res.exitCode === 0 ? 0 : 2;
await pool.end();
