// Unit tests for the PURE decision logic of the CI verification scripts (scripts/ci/*). They do not run Prisma, PostgreSQL or the
// workflow: they prove the safety rules (redaction, disposable-database guard, audit policy, vitest completeness, summary) fail
// closed. The workflow itself still has to be executed on a real runner.
import { describe, expect, it } from "vitest";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(__dirname, "../../..");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const load = async (rel: string): Promise<any> => import(/* @vite-ignore */ pathToFileURL(path.join(root, rel)).href);

describe("redact.mjs", () => {
  it("removes the configured secret value, database URLs, bearer tokens and API-key shapes", async () => {
    const { buildRedactor } = await load("scripts/ci/redact.mjs");
    const secret = "s3cr3t-value-0123456789abcdef";
    const r = buildRedactor({ CI_REDACT_VARS: "SESSION_SECRET", SESSION_SECRET: secret });
    const out = r(`x ${secret} postgresql://u:pw@db.internal:5432/app Bearer abcdefgh12345678 sk_live_ABCDEFGH12345678 sk-abcdefghijklmnopqrstuvwxyz`);
    for (const leaked of [secret, "pw@db.internal", "abcdefgh12345678", "ABCDEFGH12345678", "abcdefghijklmnopqrstuvwxyz"]) expect(out).not.toContain(leaked);
    expect(out).toContain("<redacted>");
  });
  it("ignores too-short values so ordinary words are not blanked out", async () => {
    const { buildRedactor } = await load("scripts/ci/redact.mjs");
    expect(buildRedactor({ CI_REDACT_VARS: "X", X: "abc" })("abc stays")).toBe("abc stays");
  });
});

describe("lib/db-safety.mjs", () => {
  const ci = { GITHUB_ACTIONS: "true" } as Record<string, string>;
  it("accepts only a loopback mm_ci_* database in CI", async () => {
    const { assertDisposable } = await load("scripts/ci/lib/db-safety.mjs");
    expect(() => assertDisposable("postgresql://postgres@127.0.0.1:5432/mm_ci_fresh", ci)).not.toThrow();
    expect(() => assertDisposable("postgresql://postgres@localhost:5432/mm_ci_shadow", ci)).not.toThrow();
  });
  it.each([
    ["remote host", "postgresql://postgres@db.example.com:5432/mm_ci_fresh", ci],
    ["private-network host", "postgresql://postgres@10.0.0.5:5432/mm_ci_fresh", ci],
    ["production-looking name", "postgresql://postgres@127.0.0.1:5432/marketmitra", ci],
    ["postgres maintenance db", "postgresql://postgres@127.0.0.1:5432/postgres", ci],
    ["not CI and no opt-in", "postgresql://postgres@127.0.0.1:5432/mm_ci_fresh", {}],
    ["non-postgres scheme", "mysql://root@127.0.0.1:3306/mm_ci_fresh", ci],
    ["garbage", "not a url", ci],
    ["port mismatch", "postgresql://postgres@127.0.0.1:5432/mm_ci_fresh", { ...ci, MM_CI_PG_PORT: "6000" }],
  ])("refuses %s", async (_n, url, env) => {
    const { assertDisposable } = await load("scripts/ci/lib/db-safety.mjs");
    expect(() => assertDisposable(url, env)).toThrow(/refusing/);
  });
  it("rejects identifier-injection database names", async () => {
    const { assertDisposableName } = await load("scripts/ci/lib/db-safety.mjs");
    for (const bad of ['mm_ci_x"; DROP DATABASE postgres;--', "mm_ci_X", "mm_ci_", "template1", "mm_ci_" + "a".repeat(41)]) expect(() => assertDisposableName(bad)).toThrow(/refusing/);
    expect(() => assertDisposableName("mm_ci_existing")).not.toThrow();
  });
});

describe("audit-policy.mjs evaluate()", () => {
  const deferred = { maxSeverity: "high", packages: { braces: "reason" } };
  const lock = { packages: { "node_modules/braces": { dev: true }, "node_modules/next": {} } };
  const clean = { metadata: { vulnerabilities: { total: 0 } }, vulnerabilities: {} };
  const all = (v: object) => ({ metadata: { vulnerabilities: { total: Object.keys(v).length } }, vulnerabilities: v });
  it("passes when production is clean and only the reviewed dev-only advisory remains, and still reports it as deferred", async () => {
    const { evaluate } = await load("scripts/ci/audit-policy.mjs");
    const r = evaluate({ prod: clean, all: all({ braces: { severity: "high", nodes: ["node_modules/braces"] } }), deferred, lock });
    expect(r.ok).toBe(true);
    expect(r.deferred.map((d: { name: string }) => d.name)).toEqual(["braces"]);
  });
  it.each([
    ["production vulnerability", { metadata: { vulnerabilities: { total: 1 } }, vulnerabilities: { next: {} } }, {}],
    ["audit did not run (empty prod JSON)", {}, {}],
    ["new unlisted advisory", clean, { evil: { severity: "low", nodes: ["node_modules/evil"] } }],
    ["severity above the deferred maximum", clean, { braces: { severity: "critical", nodes: ["node_modules/braces"] } }],
    ["deferred package on a non-dev path", clean, { braces: { severity: "high", nodes: ["node_modules/next"] } }],
    ["install path missing from the lockfile", clean, { braces: { severity: "high", nodes: ["node_modules/ghost/node_modules/braces"] } }],
  ])("fails on %s", async (_n, prod, v) => {
    const { evaluate } = await load("scripts/ci/audit-policy.mjs");
    expect(evaluate({ prod, all: all(v), deferred, lock }).ok).toBe(false);
  });
});

describe("assert-vitest.mjs check()", () => {
  const ok = { numTotalTests: 10, numPassedTests: 10, numFailedTests: 0, numPendingTests: 0, numTodoTests: 0, numFailedTestSuites: 0, success: true };
  it("accepts only a complete, fully-passing run", async () => {
    const { check } = await load("scripts/ci/assert-vitest.mjs");
    expect(check(ok)).toEqual([]);
  });
  it.each([
    ["skipped tests (e.g. Redis suite skipped)", { ...ok, numPassedTests: 3, numPendingTests: 7 }],
    ["failed tests", { ...ok, numFailedTests: 1, success: false }],
    ["a test file that failed to load", { ...ok, numFailedTestSuites: 1 }],
    ["todo tests", { ...ok, numTodoTests: 1 }],
    ["zero tests", { ...ok, numTotalTests: 0 }],
    ["success=false", { ...ok, success: false }],
  ])("rejects %s", async (_n, report) => {
    const { check } = await load("scripts/ci/assert-vitest.mjs");
    expect(check(report).length).toBeGreaterThan(0);
  });
  it("rejects a missing report", async () => {
    const { check } = await load("scripts/ci/assert-vitest.mjs");
    expect(check(null).length).toBeGreaterThan(0);
  });
});

describe("summarize.mjs", () => {
  it("reports every required gate that did not run as NOT RUN and never passes an incomplete run", async () => {
    const { summarize, REQUIRED_GATES } = await load("scripts/ci/summarize.mjs");
    const fs = await import("node:fs");
    const os = await import("node:os");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mm-sum-"));
    try {
      fs.writeFileSync(path.join(dir, "gates.tsv"), "env-guard\trequired\t0\ts\te\tc\nnpm-ci\trequired\t1\ts\te\tc\n");
      const s = summarize(dir);
      expect(s.allPassed).toBe(false);
      expect(s.gates.find((g: { id: string }) => g.id === "env-guard").status).toBe("PASS");
      expect(s.gates.find((g: { id: string }) => g.id === "npm-ci").status).toBe("FAIL");
      expect(s.gates.filter((g: { status: string }) => g.status === "NOT RUN").length).toBe(REQUIRED_GATES.length - 2);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
  it("does not pass when every gate exited 0 but no test or HTTP results were recorded", async () => {
    const { summarize, REQUIRED_GATES } = await load("scripts/ci/summarize.mjs");
    const fs = await import("node:fs");
    const os = await import("node:os");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mm-sum-"));
    try {
      fs.writeFileSync(path.join(dir, "gates.tsv"), REQUIRED_GATES.map((id: string) => `${id}\trequired\t0\ts\te\tc`).join("\n") + "\n");
      expect(summarize(dir).allPassed).toBe(false);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe("source-digest.mjs", () => {
  it("is deterministic and excludes build and dependency directories", async () => {
    const { digestTree } = await load("scripts/ci/source-digest.mjs");
    const fs = await import("node:fs");
    const os = await import("node:os");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mm-dig-"));
    try {
      fs.writeFileSync(path.join(dir, "a.txt"), "one");
      fs.mkdirSync(path.join(dir, "sub")); fs.writeFileSync(path.join(dir, "sub", "b.txt"), "two");
      const d1 = digestTree(dir);
      fs.mkdirSync(path.join(dir, "node_modules")); fs.writeFileSync(path.join(dir, "node_modules", "x.js"), "ignored");
      fs.mkdirSync(path.join(dir, ".next")); fs.writeFileSync(path.join(dir, ".next", "y.js"), "ignored");
      fs.mkdirSync(path.join(dir, ".ci-evidence")); fs.writeFileSync(path.join(dir, ".ci-evidence", "z.log"), "ignored");
      expect(digestTree(dir)).toEqual(d1);
      fs.writeFileSync(path.join(dir, "a.txt"), "changed");
      expect(JSON.stringify(digestTree(dir))).not.toEqual(JSON.stringify(d1));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe("verify-action-pins.mjs", () => {
  const sha = "11d5960a326750d5838078e36cf38b85af677262";
  it("accepts only full-SHA pins with a vX.Y.Z tag comment", async () => {
    const { classify } = await load("scripts/ci/verify-action-pins.mjs");
    expect(classify({ ref: `actions/checkout@${sha}`, comment: "v4.4.0" }).ok).toBe(true);
    for (const bad of [
      { ref: "actions/checkout@v4", comment: null },
      { ref: "actions/checkout@main", comment: "v4.4.0" },
      { ref: `actions/checkout@${sha.slice(0, 7)}`, comment: "v4.4.0" },
      { ref: `actions/checkout@${sha}`, comment: null },
      { ref: `actions/checkout@${sha}`, comment: "latest" },
      { ref: "./local-action", comment: null },
      { ref: "docker://alpine:3", comment: null },
    ]) expect(classify(bad).ok).toBe(false);
  });
  it("finds uses: lines with and without a trailing comment", async () => {
    const { findUses } = await load("scripts/ci/verify-action-pins.mjs");
    const r = findUses(`steps:\n  - uses: a/b@${sha} # v1.2.3\n    with:\n      x: 1\n  - name: n\n    uses: c/d@v1\n`);
    expect(r.map((x: { ref: string; comment: string | null }) => [x.ref, x.comment])).toEqual([[`a/b@${sha}`, "v1.2.3"], ["c/d@v1", null]]);
  });
  it("the committed workflow has every third-party action pinned by full SHA with a tag comment", async () => {
    const { findUses, classify } = await load("scripts/ci/verify-action-pins.mjs");
    const fs = await import("node:fs");
    const dir = path.join(root, ".github/workflows");
    const uses = fs.readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).flatMap((f) => findUses(fs.readFileSync(path.join(dir, f), "utf8")));
    expect(uses.length).toBeGreaterThan(0);
    for (const u of uses) expect(classify(u), `${u.ref} (line ${u.line})`).toMatchObject({ ok: true });
  });
});
