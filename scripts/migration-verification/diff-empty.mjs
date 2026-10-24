import { openEngine, loadSchema, NOFILTER } from "./engine.mjs";
const [,, url, schemaFile] = process.argv;
const { engine, pool, version } = await openEngine(url, schemaFile);
console.error("schema-engine-wasm", version);
const res = await engine.diff({ from: { tag: "empty" }, to: { tag: "schemaDatamodel", ...loadSchema(schemaFile) }, shadowDatabaseUrl: null, script: true, exitCode: null, filters: NOFILTER });
process.stdout.write(res.stdout ?? "");
await pool.end();
