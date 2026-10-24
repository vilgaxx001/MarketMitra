// Invokes the project's OWN Prisma client generator (@prisma/client/generator-build, version pinned by the project: 6.2.1)
// exactly as the Prisma CLI does (JSON-RPC over stdio), feeding it the DMMF produced by Prisma's own schema validator
// (the WASM build from the SAME engines commit pinned by prisma 6.2.1). The only thing skipped is the CLI's engine
// download (blocked by network policy): binaryPaths.libqueryEngine is {} so NO engine binary is copied. The generated
// TYPES are therefore genuine, but the client has no query engine and cannot run queries until `prisma generate`
// is run in an environment that can download engines.
const { spawn } = require("node:child_process");
const fs = require("node:fs"); const path = require("node:path");
const [,, projectRoot, outDir] = process.argv;
const wasm = require("schema-wasm-621/src/prisma_schema_build.js");
const schemaPath = path.join(projectRoot, "prisma/schema.prisma");
const datamodel = fs.readFileSync(schemaPath, "utf8");
const cfg = JSON.parse(wasm.get_config(JSON.stringify({ prismaSchema: datamodel, datasourceOverrides: {}, ignoreEnvVarErrors: true, env: {} })));
const dmmf = JSON.parse(wasm.get_dmmf(JSON.stringify({ prismaSchema: datamodel, noColor: true })));
const gen = cfg.config.generators[0];
const enginesVersion = require(path.join(projectRoot, "node_modules/@prisma/engines-version/package.json")).prisma.enginesVersion;
const generator = { ...gen, output: { value: outDir, fromEnvVar: null }, isCustomOutput: false, binaryTargets: [{ fromEnvVar: null, value: "debian-openssl-3.0.x", native: true }], sourceFilePath: schemaPath };
const datasources = cfg.config.datasources.map((d) => ({ ...d, activeProvider: d.activeProvider ?? d.provider }));
const child = spawn("node", [path.join(projectRoot, "node_modules/@prisma/client/generator-build/index.js")], { stdio: ["pipe", "ignore", "pipe"] });
let buf = ""; const pending = new Map();
child.stderr.on("data", (d) => { buf += d; let i; while ((i = buf.indexOf("\n")) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (!line.trim()) continue; try { const m = JSON.parse(line); if (m.id != null && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } else console.log("[generator]", line.slice(0, 300)); } catch { console.log("[generator]", line.slice(0, 300)); } } });
const call = (method, params, id) => new Promise((res) => { pending.set(id, res); child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params, id }) + "\n"); });
(async () => {
  const man = await call("getManifest", generator, 1);
  console.log("manifest:", JSON.stringify((man.result ?? man.error)).slice(0, 200));
  const res = await call("generate", { generator, otherGenerators: [], schemaPath, dmmf, datasources, datamodel, version: enginesVersion, binaryPaths: { libqueryEngine: {} }, postinstall: false, noEngine: false }, 2);
  console.log("generate:", res.error ? "ERROR " + JSON.stringify(res.error).slice(0, 600) : "OK");
  child.stdin.end(); process.exitCode = res.error ? 1 : 0;
})();
