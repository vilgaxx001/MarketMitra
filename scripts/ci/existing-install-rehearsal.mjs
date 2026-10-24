// Existing-installation upgrade rehearsal with the REAL Prisma CLI (docs/DATABASE_MIGRATIONS.md, section B), on SYNTHETIC data in
// DISPOSABLE databases only. Scope: proves the documented baseline path (`migrate resolve --applied` + `migrate deploy`) leaves
// pre-existing rows untouched and ends with no drift. It does NOT prove production-data migration safety.
//
//   MM_CI_PG_BASE=postgresql://postgres@127.0.0.1:5432 node scripts/ci/existing-install-rehearsal.mjs
// Databases used (created by scripts/ci/db.mjs beforehand): mm_ci_existing
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertDisposable } from "./lib/db-safety.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const pg = createRequire(path.join(root, "scripts/migration-verification/package.json"))("pg");
const base = (process.env.MM_CI_PG_BASE ?? "").replace(/\/$/, "");
if (!base) { console.error("MM_CI_PG_BASE is required"); process.exit(2); }
const url = `${base}/mm_ci_existing`;
assertDisposable(url);
const fixture = path.join(root, "scripts/migration-verification/fixtures/schema-modules-1-4.prisma");
const seedSql = fs.readFileSync(path.join(root, "scripts/migration-verification/fixtures/seed-existing.sql"), "utf8");
const BASELINE = "20261009000000_baseline_modules_1_4";

const results = [];
const step = (name, ok, detail = "") => { results.push({ name, ok: Boolean(ok), detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -- " + detail : ""}`); if (!ok) throw new Error(`step failed: ${name}`); };
const prisma = (args) => {
  const r = spawnSync("npx", ["prisma", ...args], { cwd: root, encoding: "utf8", env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url } });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`.replace(/postgres(?:ql)?:\/\/[^\s"'<>)]+/gi, "postgresql://<redacted>");
  console.log(`$ npx prisma ${args.join(" ")}  -> exit ${r.status}\n${out.trim().split("\n").slice(0, 25).join("\n")}`);
  return { code: r.status, out };
};

const c = new pg.Client({ connectionString: url });
await c.connect();
const snapshot = async () => {
  const tables = (await c.query(`select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' and table_name <> '_prisma_migrations' order by 1`)).rows.map((r) => r.table_name);
  const snap = {};
  for (const t of tables) { const r = await c.query(`select count(*)::int n, md5(coalesce(string_agg(x::text, '|' order by x::text), '')) h from "${t}" x`); snap[t] = `${r.rows[0].n}:${r.rows[0].h}`; }
  return snap;
};
try {
  // 1. an installation created WITHOUT migrations (the `db push` path) from the Modules 1-4 schema. --skip-generate keeps the genuine client untouched.
  step("db push of the Modules 1-4 fixture schema (installation that predates migrations)", prisma(["db", "push", "--schema", fixture, "--skip-generate"]).code === 0);
  await c.query(seedSql);
  const before = await snapshot();
  const seeded = Object.entries(before).filter(([, v]) => !v.startsWith("0:")).map(([k]) => k);
  step("synthetic rows seeded", seeded.length >= 3, `tables with rows: ${seeded.join(", ")}`);
  // 2. docs section B: the live database must equal the Modules 1-4 reference schema BEFORE baselining
  step("migrate diff: existing DB equals the Modules 1-4 reference schema (exit 0)", prisma(["migrate", "diff", "--from-url", url, "--to-schema-datamodel", fixture, "--exit-code"]).code === 0);
  // 3. record the baseline as applied WITHOUT executing it, then deploy the rest
  step("migrate resolve --applied (baseline)", prisma(["migrate", "resolve", "--applied", BASELINE]).code === 0);
  const dep = prisma(["migrate", "deploy"]);
  step("migrate deploy applies the two additive migrations", dep.code === 0 && /20261010120000_add_business_ai_preferences/.test(dep.out) && /20261011120000_add_business_memories/.test(dep.out) && !dep.out.includes(BASELINE));
  // 4. data preserved, only the 5B tables added
  const after = await snapshot();
  const changed = Object.keys(before).filter((t) => before[t] !== after[t]);
  step("every pre-existing table is byte-for-byte unchanged (row count and content hash)", changed.length === 0, changed.length ? `changed: ${changed.join(", ")}` : `${Object.keys(before).length} tables compared`);
  const added = Object.keys(after).filter((t) => !(t in before)).sort();
  step("exactly the 5B tables were added", JSON.stringify(added) === JSON.stringify(["business_ai_preferences", "business_memories"]), added.join(", "));
  // 5. no drift between the upgraded database and the current schema
  step("migrate diff: upgraded DB equals prisma/schema.prisma (exit 0, no drift)", prisma(["migrate", "diff", "--from-url", url, "--to-schema-datamodel", path.join(root, "prisma/schema.prisma"), "--exit-code"]).code === 0);
  const hist = (await c.query(`select migration_name, finished_at is not null as finished from _prisma_migrations order by migration_name`)).rows;
  step("_prisma_migrations lists all 3 migrations as finished", hist.length === 3 && hist.every((h) => h.finished), hist.map((h) => h.migration_name).join(", "));
} catch (e) {
  console.error(String(e.message ?? e));
  process.exitCode = 1;
} finally {
  await c.end();
  const dir = process.env.CI_EVIDENCE_DIR;
  if (dir) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, "existing-install-rehearsal.json"), JSON.stringify({ scope: "synthetic disposable data; not production-data safety", results }, null, 1)); }
}
