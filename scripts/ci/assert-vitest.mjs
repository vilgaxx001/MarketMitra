// Fails unless the vitest JSON report shows a COMPLETE run: >0 tests, 0 failed tests, 0 failed test files, 0 skipped/pending/todo and
// success=true. Skipped tests are never counted as passed: the real-Redis suite skips itself when Redis is unreachable, so a "green"
// vitest exit with skipped tests is a blocked check, not a pass.
//   node scripts/ci/assert-vitest.mjs <vitest.json>
import fs from "node:fs";

export function check(report) {
  const p = [];
  if (!report || typeof report.numTotalTests !== "number") return ["vitest JSON report is missing or malformed (the run did not complete)"];
  if (report.numTotalTests === 0) p.push("no tests were executed");
  if (report.numFailedTests > 0) p.push(`${report.numFailedTests} failed tests`);
  if ((report.numFailedTestSuites ?? 0) > 0) p.push(`${report.numFailedTestSuites} failed test files`);
  if (report.numPendingTests > 0) p.push(`${report.numPendingTests} skipped tests (the real-Redis integration suite must connect and run)`);
  if ((report.numTodoTests ?? 0) > 0) p.push(`${report.numTodoTests} todo tests`);
  if (report.success !== true) p.push("vitest reported success=false");
  return p;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let report = null;
  try { report = JSON.parse(fs.readFileSync(process.argv[2], "utf8")); } catch {}
  const problems = check(report);
  if (problems.length) { for (const x of problems) console.error(`FAIL: ${x}`); process.exit(1); }
  console.log(`OK: ${report.numTotalTests} tests, ${report.numPassedTests} passed, 0 failed, 0 skipped`);
}
