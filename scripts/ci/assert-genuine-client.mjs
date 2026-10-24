// Proves the Prisma client in use is the GENUINELY generated one running on its normal library query engine, not the WASM
// substitute used where engine downloads are blocked (scripts/http-verification/setup-wasm-client.cjs).
//   node scripts/ci/assert-genuine-client.mjs static     after `prisma generate` (no database needed)
//   node scripts/ci/assert-genuine-client.mjs runtime    needs DATABASE_URL: runs SELECT 1 through `new PrismaClient()` (no adapter)
// Writes <CI_EVIDENCE_DIR>/genuine-client-<mode>.json and exits non-zero on any failed assertion.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const req = createRequire(path.join(root, "package.json"));
const mode = process.argv[2];
if (!["static", "runtime"].includes(mode)) { console.error("usage: assert-genuine-client.mjs <static|runtime>"); process.exit(2); }

const checks = [];
const check = (name, ok, detail = "") => { checks.push({ name, ok: Boolean(ok), detail: String(detail) }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -- " + detail : ""}`); };

// 1. no substitute / override of the client or engines may be active
const nodeOptions = process.env.NODE_OPTIONS ?? "";
check("NODE_OPTIONS does not preload anything", !/--require|-r\s|--import|preload|setup-wasm/.test(nodeOptions), nodeOptions ? "NODE_OPTIONS is set" : "unset");
for (const v of ["PRISMA_QUERY_ENGINE_LIBRARY", "PRISMA_QUERY_ENGINE_BINARY", "PRISMA_SCHEMA_ENGINE_BINARY", "PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING", "PRISMA_CLIENT_ENGINE_TYPE"]) {
  check(`${v} is unset (no engine override / no checksum suppression)`, process.env[v] === undefined);
}
const mirror = process.env.PRISMA_ENGINES_MIRROR;
check("PRISMA_ENGINES_MIRROR is unset or an https URL (an approved mirror must be explicit)", mirror === undefined || /^https:\/\//.test(mirror), mirror ? "set" : "unset");

const clientDir = path.join(root, "node_modules/.prisma/client");
if (mode === "static") {
  check("generated client directory exists", fs.existsSync(clientDir), "node_modules/.prisma/client");
  const files = fs.existsSync(clientDir) ? fs.readdirSync(clientDir) : [];
  const engines = files.filter((f) => /^libquery_engine-.*\.so\.node$/.test(f));
  check("a library query engine (libquery_engine-*.so.node) is present next to the generated client", engines.length >= 1, engines.join(", ") || "none");
  const size = engines[0] ? fs.statSync(path.join(clientDir, engines[0])).size : 0;
  check("the engine file is a real binary (> 1 MiB)", size > 1_048_576, `${size} bytes`);
  const gen = fs.existsSync(path.join(clientDir, "schema.prisma")) ? fs.readFileSync(path.join(clientDir, "schema.prisma"), "utf8") : "";
  check("generated client was NOT built with the driverAdapters preview flag (that marks the substitute client)", gen.length > 0 && !/driverAdapters/.test(gen));
  const repo = fs.readFileSync(path.join(root, "prisma/schema.prisma"), "utf8");
  const same = gen.replace(/\r\n/g, "\n").trimEnd() === repo.replace(/\r\n/g, "\n").trimEnd();
  console.log(`INFO  generated schema copy identical to prisma/schema.prisma: ${same} (informational, not an assertion)`);
}
if (mode === "runtime") {
  const url = process.env.DATABASE_URL;
  check("DATABASE_URL is set", Boolean(url));
  const { PrismaClient, Prisma } = req("@prisma/client");
  const cliVersion = req("prisma/package.json").version;
  const pinned = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).dependencies["@prisma/client"];
  const expectedEngine = req("@prisma/engines-version/package.json").prisma?.enginesVersion ?? req("@prisma/engines-version").enginesVersion;
  check("client version equals the exact pin in package.json", Prisma.prismaVersion.client === pinned, `${Prisma.prismaVersion.client} vs pin ${pinned}`);
  check("CLI version equals the client version", cliVersion === Prisma.prismaVersion.client, cliVersion);
  check("client reports the engine commit that this Prisma release pins", Prisma.prismaVersion.engine === expectedEngine, `${Prisma.prismaVersion.engine}`);
  const db = new PrismaClient(); // no adapter => the normal library engine
  try {
    const rows = await db.$queryRawUnsafe("select 1 as ok");
    check("a query round-trips through the library query engine to PostgreSQL", Number(rows?.[0]?.ok) === 1);
    const t = await db.$queryRawUnsafe(`select count(*)::int as n from information_schema.tables where table_schema='public' and table_name in ('users','sessions','business_memories')`);
    check("the migrated schema is visible through the client (users, sessions, business_memories)", Number(t?.[0]?.n) === 3);
  } catch (e) { check("a query round-trips through the library query engine to PostgreSQL", false, String(e?.message ?? e).split("\n")[0]); }
  finally { await db.$disconnect().catch(() => {}); }
  console.log(`INFO  versions: ${JSON.stringify({ client: Prisma.prismaVersion.client, engine: Prisma.prismaVersion.engine, cli: cliVersion, node: process.version })}`);
}

const dir = process.env.CI_EVIDENCE_DIR;
if (dir) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, `genuine-client-${mode}.json`), JSON.stringify({ mode, checks }, null, 1)); }
process.exit(checks.every((c) => c.ok) ? 0 : 1);
