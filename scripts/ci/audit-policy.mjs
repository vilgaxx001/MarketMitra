// Decides the dependency-audit gate from `npm audit --json` output. Production and development findings are reported
// SEPARATELY and nothing is suppressed:
//   * production (`npm audit --omit=dev`) must report ZERO vulnerabilities, otherwise FAIL
//   * the full audit may only contain advisories listed in scripts/ci/audit-deferred.json AND every affected install path must be a
//     dev-only entry (dev:true) in package-lock.json; anything else (new package, critical, non-dev path) FAILS
//   * deferred findings are printed as DEFERRED so they can never be mistaken for a clean tree
//   node scripts/ci/audit-policy.mjs <audit-prod.json> <audit-all.json> [deferred.json] [package-lock.json]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SEV = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };

export function evaluate({ prod, all, deferred, lock }) {
  const problems = [];
  const prodTotal = prod?.metadata?.vulnerabilities?.total;
  if (typeof prodTotal !== "number") problems.push("production audit JSON is missing metadata.vulnerabilities.total (the audit did not run)");
  else if (prodTotal !== 0) problems.push(`production dependencies have ${prodTotal} vulnerabilit${prodTotal === 1 ? "y" : "ies"}: ${Object.keys(prod.vulnerabilities ?? {}).join(", ")}`);
  if (typeof all?.metadata?.vulnerabilities?.total !== "number") problems.push("full audit JSON is missing metadata.vulnerabilities.total (the audit did not run)");

  const allowed = deferred.packages ?? {};
  const maxSev = SEV[deferred.maxSeverity ?? "high"];
  const found = Object.entries(all?.vulnerabilities ?? {});
  const deferredFound = [], unexpected = [];
  for (const [name, v] of found) {
    const nodes = v.nodes ?? [];
    const nonDev = nodes.filter((n) => lock.packages?.[n] && lock.packages[n].dev !== true);
    const unknownNode = nodes.filter((n) => !lock.packages?.[n]);
    if (!(name in allowed)) unexpected.push(`${name} (${v.severity}) is not in the deferred list`);
    else if ((SEV[v.severity] ?? 99) > maxSev) unexpected.push(`${name} severity ${v.severity} exceeds the deferred maximum ${deferred.maxSeverity}`);
    else if (nonDev.length) unexpected.push(`${name} has non-dev install paths: ${nonDev.join(", ")}`);
    else if (unknownNode.length) unexpected.push(`${name} has install paths missing from the lockfile: ${unknownNode.join(", ")}`);
    else deferredFound.push({ name, severity: v.severity, reason: allowed[name] });
  }
  problems.push(...unexpected);
  const noLongerReported = Object.keys(allowed).filter((n) => !found.some(([k]) => k === n));
  return { ok: problems.length === 0, problems, deferred: deferredFound, noLongerReported, prodTotal, allTotal: all?.metadata?.vulnerabilities?.total };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const [prodPath, allPath, defPath = path.join(root, "scripts/ci/audit-deferred.json"), lockPath = path.join(root, "package-lock.json")] = process.argv.slice(2);
  if (!prodPath || !allPath) { console.error("usage: audit-policy.mjs <audit-prod.json> <audit-all.json> [deferred.json] [package-lock.json]"); process.exit(2); }
  const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
  const r = evaluate({ prod: read(prodPath), all: read(allPath), deferred: read(defPath), lock: read(lockPath) });
  console.log(`PRODUCTION dependencies: ${r.prodTotal} vulnerabilities`);
  console.log(`ALL dependencies:        ${r.allTotal} vulnerabilities`);
  for (const d of r.deferred) console.log(`DEFERRED (dev-only, NOT fixed): ${d.name} [${d.severity}] - ${d.reason}`);
  if (r.noLongerReported.length) console.log(`NOTE: deferred entries no longer reported (remove them from audit-deferred.json): ${r.noLongerReported.join(", ")}`);
  if (r.deferred.length) console.log("The dependency tree is NOT vulnerability-free: the findings above are deferred, not resolved.");
  for (const p of r.problems) console.log(`FAIL  ${p}`);
  const dir = process.env.CI_EVIDENCE_DIR;
  if (dir) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, "audit-policy.json"), JSON.stringify(r, null, 1)); }
  console.log(r.ok ? "AUDIT POLICY: PASS (production clean; only the documented dev-only advisories remain)" : "AUDIT POLICY: FAIL");
  process.exit(r.ok ? 0 : 1);
}
