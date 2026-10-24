// Builds SUMMARY.md / summary.json in $CI_EVIDENCE_DIR from what the run ACTUALLY recorded (gates.tsv, vitest.json, http.json,
// audit-policy.json, genuine-client-*.json). A required gate with no record is reported NOT RUN (the workflow stopped before it).
// This file never decides the release verdict: that is written by a human reviewer in PRE_5C_RELEASE_GATE_REPORT.md.
import fs from "node:fs";
import path from "node:path";

export const REQUIRED_GATES = [
  "env-guard", "npm-ci", "harness-npm-ci", "db-create", "prisma-version", "prisma-validate", "prisma-generate",
  "genuine-client-static", "prisma-migrate-deploy", "genuine-client-runtime", "prisma-drift", "existing-install-rehearsal",
  "tsc", "lint", "vitest-with-redis", "build", "app-start", "http-suite", "audit-policy",
];

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

export function summarize(dir) {
  const rows = fs.existsSync(path.join(dir, "gates.tsv"))
    ? fs.readFileSync(path.join(dir, "gates.tsv"), "utf8").split("\n").filter(Boolean).map((l) => { const [id, level, exit, start, end, ...cmd] = l.split("\t"); return { id, level, exit: Number(exit), start, end, cmd: cmd.join("\t") }; })
    : [];
  const last = (id) => [...rows].reverse().find((r) => r.id === id);
  const gates = REQUIRED_GATES.map((id) => { const r = last(id); return { id, status: !r ? "NOT RUN" : r.exit === 0 ? "PASS" : "FAIL", exit: r?.exit ?? null }; });
  const vitest = readJson(path.join(dir, "vitest.json"));
  const http = readJson(path.join(dir, "http.json"));
  // numFailedTests alone is NOT enough: a test FILE that fails to load/set up (e.g. Redis unreachable) reports 0 failed tests and N skipped.
  const tests = vitest ? { total: vitest.numTotalTests, passed: vitest.numPassedTests, failed: vitest.numFailedTests, failedSuites: vitest.numFailedTestSuites ?? 0, skipped: vitest.numPendingTests, todo: vitest.numTodoTests ?? 0, success: vitest.success === true } : null;
  const httpCounts = http ? { total: http.results.length, passed: http.results.filter((r) => r.ok).length, failed: http.results.filter((r) => !r.ok).length } : null;
  const audit = readJson(path.join(dir, "audit-policy.json"));
  const extra = [];
  if (tests && (tests.failed > 0 || tests.skipped > 0 || tests.failedSuites > 0 || !tests.success)) extra.push(`vitest reported ${tests.failed} failed tests / ${tests.failedSuites} failed test files / ${tests.skipped} skipped / success=${tests.success} (skipped tests are never counted as passed; the real-Redis suite must run and connect)`);
  if (httpCounts && httpCounts.failed > 0) extra.push(`${httpCounts.failed} HTTP checks failed`);
  const bad = gates.filter((g) => g.status !== "PASS");
  const allPassed = bad.length === 0 && extra.length === 0 && Boolean(tests) && Boolean(httpCounts);
  return { gates, tests, http: httpCounts, audit, extra, allPassed, bad };
}

export function render(s, meta = {}) {
  const L = [];
  L.push("# Pre-5C release gate: CI run summary", "");
  L.push(`Source tree digest (scripts/ci/source-digest.mjs): \`${meta.digest ?? "not recorded"}\`  `);
  L.push(`Commit: \`${meta.commit ?? "not available"}\`  Run: \`${meta.run ?? "n/a"}\`  Node: \`${meta.node ?? "n/a"}\``, "");
  L.push("| Gate | Result | Exit |", "|---|---|---|");
  for (const g of s.gates) L.push(`| ${g.id} | ${g.status} | ${g.exit ?? "-"} |`);
  L.push("");
  if (s.tests) L.push(`**vitest (real Redis):** ${s.tests.total} tests, ${s.tests.passed} passed, ${s.tests.failed} failed, ${s.tests.failedSuites} failed files, ${s.tests.skipped} skipped`);
  if (s.http) L.push(`**HTTP suite (genuine client):** ${s.http.total} checks, ${s.http.passed} passed, ${s.http.failed} failed (skipped/blocked/not-run: 0 by construction; a check that did not run would be absent from the total)`);
  if (s.audit) L.push(`**Audit:** production ${s.audit.prodTotal ?? "unknown (audit did not run)"} vulnerabilities; all ${s.audit.allTotal}; deferred dev-only: ${s.audit.deferred.map((d) => d.name).join(", ") || "none"} (deferred, not resolved)`);
  for (const e of s.extra) L.push(`- ${e}`);
  L.push("");
  L.push(s.allPassed ? "**RESULT: every required gate recorded exit 0 in this run.** A reviewer must still read the logs and record the verdict in PRE_5C_RELEASE_GATE_REPORT.md." : `**RESULT: NOT PASSED.** Failed or not run: ${s.bad.map((g) => `${g.id} (${g.status})`).join(", ") || "see notes above"}.`);
  L.push("", "Production-data migration safety is NOT established by this run (synthetic disposable data only). Live AI, email, storage and billing are NOT exercised.");
  return L.join("\n") + "\n";
}

// Workflow-command escaping (https://docs.github.com/actions/reference/workflow-commands-for-github-actions): % \r \n must be encoded.
export const escData = (v) => String(v).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");

// Surfaces the recorded results as check-run ANNOTATIONS (readable through the Checks API without downloading the artifact).
// Content is derived only from files the run produced; nothing is added that was not recorded. Used when CI_EMIT_ANNOTATIONS=1.
export function annotations(s, meta = {}, dir = "") {
  const out = [];
  const env = (() => { try { return fs.readFileSync(path.join(dir, "environment.txt"), "utf8").trim(); } catch { return "environment.txt not found"; } })();
  out.push(["pre5c-summary: environment", env]);
  out.push(["pre5c-summary: gates", s.gates.map((g) => `${g.id}: ${g.status} (exit ${g.exit ?? "-"})`).join("\n")]);
  const counts = [];
  if (s.tests) counts.push(`vitest: ${s.tests.total} total, ${s.tests.passed} passed, ${s.tests.failed} failed, ${s.tests.failedSuites} failed files, ${s.tests.skipped} skipped, ${s.tests.todo} todo, success=${s.tests.success}`);
  else counts.push("vitest: no vitest.json recorded");
  if (s.http) counts.push(`http: ${s.http.total} checks, ${s.http.passed} passed, ${s.http.failed} failed`);
  else counts.push("http: no http.json recorded");
  out.push(["pre5c-summary: counts", counts.join("\n")]);
  if (s.audit) {
    out.push(["pre5c-summary: audit", [`production total: ${s.audit.prodTotal ?? "unknown"}; all total: ${s.audit.allTotal ?? "unknown"}; policy ok: ${s.audit.ok}`, ...(s.audit.problems ?? []).map((x) => `PROBLEM: ${x}`), ...(s.audit.deferred ?? []).map((d) => `deferred: ${d.name} (${d.severity})`)].join("\n")]);
  } else out.push(["pre5c-summary: audit", "no audit-policy.json recorded"]);
  out.push(["pre5c-summary: result", s.allPassed ? "every required gate recorded exit 0" : `NOT PASSED: ${s.bad.map((g) => `${g.id} (${g.status})`).join(", ") || "see counts"}${s.extra.length ? "; " + s.extra.join("; ") : ""}`]);
  return out.map(([title, msg]) => `::notice title=${escData(title).replace(/:/g, "%3A").replace(/,/g, "%2C")}::${escData(msg)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.env.CI_EVIDENCE_DIR; if (!dir) { console.error("CI_EVIDENCE_DIR is required"); process.exit(2); }
  const s = summarize(dir);
  const md = render(s, { digest: process.env.CI_SOURCE_DIGEST, commit: process.env.GITHUB_SHA, run: process.env.GITHUB_RUN_ID && `${process.env.GITHUB_RUN_ID}/${process.env.GITHUB_RUN_ATTEMPT ?? 1}`, node: process.version });
  fs.writeFileSync(path.join(dir, "SUMMARY.md"), md); fs.writeFileSync(path.join(dir, "summary.json"), JSON.stringify(s, null, 1));
  console.log(md);
  if (process.env.CI_EMIT_ANNOTATIONS === "1") for (const a of annotations(s, {}, dir)) console.log(a);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
  process.exit(s.allPassed ? 0 : 1);
}
