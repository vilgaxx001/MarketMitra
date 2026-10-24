// Applies the two documented scratch patches to @prisma/adapter-pg@7.10.0 INSIDE THIS DIRECTORY'S node_modules only.
// Idempotent. Fails loudly if the adapter source differs from what the patches were written against.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), "node_modules/@prisma/adapter-pg/dist");
const MARK = "scratch harness patch";
for (const [file, unsupported] of [["index.js", "      throw new UnsupportedNativeDataType(fieldTypeId);"], ["index.mjs", "      throw new UnsupportedNativeDataType(fieldTypeId);"]]) {
  const p = path.join(dist, file);
  let s = fs.readFileSync(p, "utf8");
  if (s.includes(MARK)) { console.log(file, "already patched"); continue; }
  // 1. unknown pg system OIDs (e.g. "char", "name", read during introspection/diff) -> Text instead of throwing
  if (!s.includes(unsupported)) throw new Error(`${file}: UnsupportedNativeDataType throw not found`);
  s = s.replace(unsupported, "      return 7; // ColumnTypeEnum.Text - scratch harness patch: introspection reads pg system types such as \"char\"");
  // 2. shadow database teardown: end the pool BEFORE DROP DATABASE (otherwise: "database is being accessed by other users")
  const drop = "      await conn.executeScript(`DROP DATABASE \"${database}\"`);\n      await client.end();";
  if (!s.includes(drop)) throw new Error(`${file}: shadow teardown block not found`);
  s = s.replace(drop, "      await client.end(); // scratch harness patch: end the shadow pool BEFORE dropping its database\n      await conn.executeScript(`DROP DATABASE \"${database}\"`);");
  fs.writeFileSync(p, s);
  console.log(file, "patched");
}
