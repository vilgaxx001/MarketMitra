// Deterministic SHA-256 identity of the source tree being verified (this repository is not necessarily a git checkout, and a
// ZIP's own hash cannot be recomputed from an unpacked tree). Prints:  <sha256>  <file count>
//   digest = sha256 over lines "<sha256(file)>  <relative path>\n" sorted by path (UTF-8, "/" separators).
// Excluded (generated or local): node_modules, .next, .git, .ci-evidence, tsconfig.tsbuildinfo.
// Run the same command on the unpacked ZIP and in CI; equal digests mean identical verified sources.
//   node scripts/ci/source-digest.mjs [root]            (--list prints the per-file lines instead)
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const EXCLUDE_DIRS = new Set(["node_modules", ".next", ".git", ".ci-evidence"]);
const EXCLUDE_FILES = new Set(["tsconfig.tsbuildinfo"]);

export function listFiles(root) {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) { if (!EXCLUDE_DIRS.has(e.name)) walk(path.join(dir, e.name)); continue; }
      if (!e.isFile() || EXCLUDE_FILES.has(e.name)) continue;
      out.push(path.relative(root, path.join(dir, e.name)).split(path.sep).join("/"));
    }
  };
  walk(root);
  return out.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

export function digestTree(root) {
  const lines = listFiles(root).map((rel) => `${createHash("sha256").update(fs.readFileSync(path.join(root, rel))).digest("hex")}  ${rel}`);
  return { digest: createHash("sha256").update(lines.map((l) => l + "\n").join("")).digest("hex"), count: lines.length, lines };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const root = path.resolve(args.find((a) => !a.startsWith("--")) ?? ".");
  const r = digestTree(root);
  if (args.includes("--list")) console.log(r.lines.join("\n"));
  else console.log(`${r.digest}  ${r.count}`);
}
