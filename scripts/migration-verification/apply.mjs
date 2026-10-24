import path from "node:path";
import { openEngine, loadMigrations, NOFILTER } from "./engine.mjs";
const [,, url, migDir] = process.argv;
const { engine, pool } = await openEngine(url);
const list = loadMigrations(path.resolve(migDir));
console.log("migrations in order:", list.migrationDirectories.map((m) => m.path));
try {
  const res = await engine.applyMigrations({ migrationsList: list, filters: NOFILTER });
  console.log("APPLIED:", JSON.stringify(res.appliedMigrationNames));
} catch (e) { console.log("APPLY FAILED:", e?.message ?? JSON.stringify(e)); process.exitCode = 1; }
await pool.end();
