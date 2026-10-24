// SCRATCH VERIFICATION TOOL (not application code, not a substitute for `prisma generate`).
//
// Why: the pinned Prisma CLI could not download its engines in the environment where the Pre-5C closure was run, so there was no
// query engine and no DB-backed route could be served. @prisma/client 6.2.1 itself ships the WASM query engine
// (runtime/query_engine_bg.postgresql.wasm) used for driver adapters, so this tool builds a SEPARATE client from the unmodified
// schema (+ the driverAdapters preview flag) into <workdir>/client and a Node preload that makes `require("@prisma/client")` resolve to it,
// backed by @prisma/adapter-pg 6.2.1 (the same version as the client). The repository, its node_modules and its generated client are not touched.
//
//   node scripts/http-verification/setup-wasm-client.cjs <workdir>
//   NODE_OPTIONS="--require <workdir>/preload.cjs" DATABASE_URL=... node node_modules/next/dist/bin/next start
//
// Requires scripts/migration-verification to be installed (`npm ci`), for the schema-validator WASM that produces the DMMF.
const { spawn, execFileSync } = require("node:child_process");
const fs = require("node:fs"); const path = require("node:path");
const root = path.resolve(__dirname, "../..");
const work = path.resolve(process.argv[2] ?? "");
if (!process.argv[2]) { console.error("usage: node setup-wasm-client.cjs <workdir>"); process.exit(2); }
const out = path.join(work, "client"); fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
const wasm = require(path.join(root, "scripts/migration-verification/node_modules/schema-wasm-621/src/prisma_schema_build.js"));

const original = fs.readFileSync(path.join(root, "prisma/schema.prisma"), "utf8");
const datamodel = original.replace('previewFeatures = ["fullTextSearchPostgres"]', 'previewFeatures = ["fullTextSearchPostgres", "driverAdapters"]');
if (datamodel === original) throw new Error("expected previewFeatures line not found in schema.prisma");
const schemaPath = path.join(work, "schema.driver-adapters.prisma"); fs.writeFileSync(schemaPath, datamodel);

const cfg = JSON.parse(wasm.get_config(JSON.stringify({ prismaSchema: datamodel, datasourceOverrides: {}, ignoreEnvVarErrors: true, env: {} })));
const dmmf = JSON.parse(wasm.get_dmmf(JSON.stringify({ prismaSchema: datamodel, noColor: true })));
const enginesVersion = require(path.join(root, "node_modules/@prisma/engines-version/package.json")).prisma.enginesVersion;
const generator = { ...cfg.config.generators[0], output: { value: out, fromEnvVar: null }, isCustomOutput: true, binaryTargets: [{ fromEnvVar: null, value: "debian-openssl-3.0.x", native: true }], sourceFilePath: schemaPath };
const datasources = cfg.config.datasources.map((d) => ({ ...d, activeProvider: d.activeProvider ?? d.provider }));
const child = spawn("node", [path.join(root, "node_modules/@prisma/client/generator-build/index.js")], { stdio: ["pipe", "ignore", "pipe"] });
let buf = ""; const pending = new Map();
child.stderr.on("data", (d) => { buf += d; let i; while ((i = buf.indexOf("\n")) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (!line.trim()) continue; try { const m = JSON.parse(line); if (m.id != null && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } } catch { /* log line */ } } });
const call = (method, params, id) => new Promise((res) => { pending.set(id, res); child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params, id }) + "\n"); });

(async () => {
  await call("getManifest", generator, 1);
  const res = await call("generate", { generator, otherGenerators: [], schemaPath, dmmf, datasources, datamodel, version: enginesVersion, binaryPaths: { libqueryEngine: {} }, postinstall: false, noEngine: false }, 2);
  child.stdin.end();
  if (res.error) { console.error("generate failed", JSON.stringify(res.error).slice(0, 500)); process.exit(1); }
  // Node has no bundler loader for '#wasm-engine-loader': compile the shipped .wasm directly.
  const wasmJs = path.join(out, "wasm.js"); let s = fs.readFileSync(wasmJs, "utf8");
  const a = s.indexOf("config.engineWasm = {"), b = s.indexOf("config.injectableEdgeEnv");
  if (a < 0 || b < 0) throw new Error("engineWasm block not found in generated wasm.js");
  s = s.slice(0, a) + `config.engineWasm = {
  getRuntime: () => require('./query_engine_bg.js'),
  getQueryEngineWasmModule: async () => WebAssembly.compile(require('node:fs').readFileSync(require('node:path').join(__dirname, 'query_engine_bg.wasm')))
}

` + s.slice(b);
  fs.writeFileSync(wasmJs, s);
  // adapter-pg must match the client version (6.2.1) and takes a pg.Pool
  const ad = path.join(work, "adapter"); fs.mkdirSync(ad, { recursive: true });
  fs.writeFileSync(path.join(ad, "package.json"), JSON.stringify({ name: "adapter", private: true, dependencies: { "@prisma/adapter-pg": "6.2.1", pg: "8.13.1" } }));
  execFileSync("npm", ["install", "--no-audit", "--no-fund", "--ignore-scripts"], { cwd: ad, stdio: "inherit" });
  const shim = path.join(work, "shim"); fs.mkdirSync(shim, { recursive: true });
  fs.writeFileSync(path.join(shim, "index.js"), `// Stands in for "@prisma/client" ONLY in the verification process (see setup-wasm-client.cjs).
const base = require(${JSON.stringify(path.join(out, "wasm.js"))});
const pg = require(${JSON.stringify(path.join(ad, "node_modules/pg"))});
const { PrismaPg } = require(${JSON.stringify(path.join(ad, "node_modules/@prisma/adapter-pg"))});
class PrismaClient extends base.PrismaClient {
  constructor(opts = {}) {
    const { datasources, ...rest } = opts; // datasource url overrides are replaced by the adapter's pool
    super({ ...rest, adapter: new PrismaPg(new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10 })) });
  }
}
module.exports = { ...base, PrismaClient };
`);
  fs.writeFileSync(path.join(work, "preload.cjs"), `const Module = require("node:module");
const orig = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) { return request === "@prisma/client" ? ${JSON.stringify(path.join(shim, "index.js"))} : orig.call(this, request, ...rest); };
`);
  console.log("ready:", path.join(work, "preload.cjs"));
})();
