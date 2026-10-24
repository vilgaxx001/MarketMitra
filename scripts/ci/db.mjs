// Create / drop the DISPOSABLE CI databases (names must match mm_ci_*; see lib/db-safety.mjs).
//   MM_CI_PG_BASE=postgresql://postgres@127.0.0.1:5432  node scripts/ci/db.mjs create mm_ci_fresh mm_ci_shadow
//   MM_CI_PG_BASE=...                                   node scripts/ci/db.mjs drop   mm_ci_fresh mm_ci_shadow
// `pg` comes from scripts/migration-verification (the same place scripts/http-verification/run.mjs gets it).
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertDisposable, assertDisposableName } from "./lib/db-safety.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const pg = createRequire(path.join(here, "../migration-verification/package.json"))("pg");
const [, , action, ...names] = process.argv;
const base = process.env.MM_CI_PG_BASE;
if (!["create", "drop"].includes(action) || !names.length || !base) {
  console.error("usage: MM_CI_PG_BASE=postgresql://user@127.0.0.1:PORT node scripts/ci/db.mjs <create|drop> <mm_ci_name>...");
  process.exit(2);
}
try { for (const n of names) { assertDisposableName(n); assertDisposable(`${base.replace(/\/$/, "")}/${n}`); } } catch (e) { console.error(e.message); process.exit(3); }
const admin = new pg.Client({ connectionString: `${base.replace(/\/$/, "")}/postgres` });
await admin.connect();
try {
  for (const n of names) {
    // identifiers are validated against a strict allow-list above, so quoting is safe
    await admin.query(`DROP DATABASE IF EXISTS "${n}" WITH (FORCE)`);
    if (action === "create") await admin.query(`CREATE DATABASE "${n}"`);
    console.log(`${action === "create" ? "created" : "dropped"} database ${n}`);
  }
} finally { await admin.end(); }
