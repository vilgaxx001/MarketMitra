// Fails when the production build log contains an UNRESOLVED MODULE / IMPORT diagnostic, or when the log is not a complete build log.
//
// Why: `next build` prints "Module not found: Can't resolve '<pkg>'" as a WARNING for an unresolvable import inside a try/catch (a
// dynamic import), and "Attempted import error: 'x' is not exported from '<module>'" for a missing named export. Neither fails the
// build, and the log still ends with "Compiled successfully". A dependency that is imported but not installed therefore shipped green
// (see docs/EMAIL_AND_ACCOUNT_SECURITY.md, section "Providers"). This guard turns those diagnostics into a failed gate.
//
//   node scripts/ci/assert-build-log.mjs <build.log>        exit 0 clean | 1 findings or incomplete log | 2 unreadable/usage
//
// How it avoids false positives: a diagnostic is recognised only at the START of a line (after ANSI codes are removed), optionally
// preceded by up to three spaces and a single status glyph, which is where webpack prints them. Source code frames ("  12 | ..."),
// application log lines ("{\"msg\": ...}", "[env] WARNING: ...") and prose that merely mentions the words never match, and ordinary
// warnings (missing build cache, "Critical dependency: the request of a dependency is an expression", deprecations, [env] warnings)
// are counted and reported as ignored, not failed.
//
// How it avoids false negatives: the log must contain Next's own "Compiled successfully|with warnings" marker, otherwise the
// guard fails closed (empty file, build never ran, or the output format changed and this guard needs updating).
import fs from "node:fs";

// ANSI escape sequences (colours, cursor control) are removed so a coloured log is recognised exactly like a plain one.
// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;
const PREFIX = String.raw`^ {0,3}(?:[⚠✖✗×⨯!] )?`;

// Each pattern is a confirmed diagnostic class; `real` fixtures for each live in scripts/ci/fixtures/build-logs/.
export const DETECTORS = [
  // webpack ModuleNotFoundError: "Module not found: Can't resolve 'x' in '/dir'" (warning) or "... 'x'" (error), also
  // "Module not found: Package path ./y is not exported from package ..." and the legacy "Module not found: Error: ...".
  { kind: "module-not-found", re: new RegExp(`${PREFIX}Module not found: \\S`) },
  // Next/webpack: a named import that the target module does not export.
  { kind: "missing-export", re: new RegExp(`${PREFIX}Attempted import error: '.+' is not exported from '.+'`) },
  // webpack's classic wording of the same condition.
  { kind: "missing-export", re: new RegExp(`${PREFIX}export '.+' (?:\\(imported as '.+'\\) )?was not found in '.+'`) },
  // Node failing to load a module while Next evaluates a route during "Collecting page data" (printed as "[Error: Cannot find module ...").
  { kind: "cannot-find-module", re: /^(?:\[Error|Error): Cannot find module '.+'/ },
];

// Marker Next prints once webpack has finished compiling: " ✓ Compiled successfully in 19s" / " ⚠ Compiled with warnings in 12s".
const COMPILED = /^ {0,3}(?:[✓⚠] )?Compiled (?:successfully|with warnings)\b/;
// An importing file header as printed by webpack/Next directly above a diagnostic: "./src/lib/email.ts".
const FILE_HEADER = /^\.{1,2}\/\S+$/;

export function analyze(text) {
  const lines = String(text).replace(ANSI, "").split(/\r?\n/);
  const findings = [];
  let sawCompileMarker = false;
  let ignoredWarnings = 0;
  let lastHeader = null;
  lines.forEach((raw, i) => {
    const line = raw.replace(/\s+$/, "");
    if (COMPILED.test(line)) sawCompileMarker = true;
    if (FILE_HEADER.test(line)) { lastHeader = { file: line, at: i }; return; }
    const hit = DETECTORS.find((d) => d.re.test(line));
    if (hit) {
      // The header belongs to this diagnostic only if it is the immediately preceding non-empty line.
      const from = lastHeader && lines.slice(lastHeader.at + 1, i).every((l) => l.trim() === "") ? lastHeader.file : null;
      findings.push({ line: i + 1, kind: hit.kind, from, text: line.trim() });
    } else if (/(?:^|\s)⚠ /.test(line) || /^\s*(?:\[env\] )?WARNING\b/i.test(line)) {
      ignoredWarnings++;
    }
  });
  const problems = [];
  // Reported only when nothing else was found: a hard error ("Failed to compile") aborts before the marker, and the finding is the verdict.
  if (!sawCompileMarker && findings.length === 0) problems.push("no 'Compiled successfully' / 'Compiled with warnings' line: this is not a complete next build log (the build did not run, the log is empty, or Next changed its output and scripts/ci/assert-build-log.mjs must be updated)");
  return { findings, sawCompileMarker, ignoredWarnings, problems, lineCount: lines.length };
}

/** Collapses repeats (Next prints each diagnostic once per compiler: server, edge, client). */
export function summarizeFindings(findings) {
  const byKey = new Map();
  for (const f of findings) {
    const k = `${f.kind}\u0000${f.from ?? ""}\u0000${f.text}`;
    const e = byKey.get(k);
    if (e) { e.count++; e.lines.push(f.line); } else byKey.set(k, { ...f, count: 1, lines: [f.line] });
  }
  return [...byKey.values()];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2];
  if (!file) { console.error("usage: node scripts/ci/assert-build-log.mjs <build.log>"); process.exit(2); }
  let text;
  try { text = fs.readFileSync(file, "utf8"); } catch (e) { console.error(`FAIL: cannot read ${file} (${e.code ?? "error"}): the build gate did not produce a log`); process.exit(2); }
  const r = analyze(text);
  const unique = summarizeFindings(r.findings);
  for (const f of unique) {
    console.error(`FAIL: ${f.kind}${f.from ? ` in ${f.from}` : ""}: ${f.text}  (log line${f.lines.length > 1 ? "s" : ""} ${f.lines.join(", ")})`);
  }
  for (const p of r.problems) console.error(`FAIL: ${p}`);
  if (unique.length || r.problems.length) {
    if (unique.length) console.error(`${unique.length} distinct unresolved-module/import diagnostic(s) (${r.findings.length} occurrence(s)). Declare and install the dependency, or fix the import; do not silence this guard.`);
    process.exit(1);
  }
  console.log(`OK: ${r.lineCount} log lines scanned, compile marker present, 0 unresolved-module/import diagnostics (${r.ignoredWarnings} other warning line(s) ignored: they do not indicate unresolved dependencies)`);
}
