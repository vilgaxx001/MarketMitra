/**
 * Event configuration and wiring of the release-gate workflow, read with a real YAML parser.
 *
 * Regression for: the workflow listed `pull_request: branches: [main]`, but the repository has no `main` (its default branch is
 * `ci/pre5c-gate`), so the gate never ran automatically on a pull request and could not serve as a required status check.
 * This does not replace running the workflow on GitHub (the gate run does that); it fails fast on a configuration mistake.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";

const root = path.resolve(__dirname, "../../..");
const WF_DIR = path.join(root, ".github/workflows");
// The repository's default branch. Change this together with `on.pull_request.branches` if the default branch is ever renamed.
const DEFAULT_BRANCH = "ci/pre5c-gate";

type Step = { name?: string; run?: string; uses?: string; if?: string };
type Workflow = { name: string; on: Record<string, { branches?: string[] } | null>; permissions?: Record<string, string>; concurrency?: unknown; jobs: Record<string, { name?: string; steps: Step[] }> };
const load = (file: string): Workflow => parse(fs.readFileSync(path.join(WF_DIR, file), "utf8")) as Workflow;
const GATE = "pre5c-release-gate.yml";

describe("pre5c-release-gate.yml events", () => {
  const wf = load(GATE);
  it("runs on pull requests that target the default branch", () => {
    expect(wf.on.pull_request).toBeTruthy();
    expect(wf.on.pull_request!.branches).toEqual([DEFAULT_BRANCH]);
  });
  it("does not name a branch that does not exist (the original mistake)", () => {
    expect(JSON.stringify(wf.on)).not.toMatch(/"main"/);
  });
  it("keeps manual runs (workflow_dispatch)", () => {
    expect(Object.keys(wf.on)).toContain("workflow_dispatch");
  });
  it("has no other triggers: nothing runs on push, schedule or from outside the repository's own events", () => {
    expect(Object.keys(wf.on).sort()).toEqual(["pull_request", "workflow_dispatch"]);
  });
  it("is the ONLY workflow triggered by pull requests (no duplicate or competing gate)", () => {
    const files = fs.readdirSync(WF_DIR).filter((f) => /\.ya?ml$/.test(f));
    const onPr = files.filter((f) => load(f).on && "pull_request" in load(f).on);
    expect(onPr).toEqual([GATE]);
  });
  it("stays least-privilege and verification-only: read-only token, serialised per ref", () => {
    expect(wf.permissions).toEqual({ contents: "read" });
    expect(wf.concurrency).toBeTruthy();
    const text = fs.readFileSync(path.join(WF_DIR, GATE), "utf8");
    expect(text).not.toMatch(/pull_request_target|secrets\./); // untrusted PR code must never run with secrets
  });
});

describe("the required status check: stable name", () => {
  it("one job, with the exact name that branch protection must require", () => {
    const wf = load(GATE);
    expect(Object.keys(wf.jobs)).toEqual(["gate"]);
    // docs/BRANCH_PROTECTION.md and the protection payload in it name this string; renaming the job silently un-requires the check.
    expect(wf.jobs.gate!.name).toBe("Pre-5C gate (Prisma 6.2.1 / PostgreSQL 16 / Redis 7)");
  });
});

describe("build-log guard wiring", () => {
  const steps = load(GATE).jobs.gate!.steps;
  const idx = (re: RegExp) => steps.findIndex((s) => re.test(s.name ?? ""));
  it("runs right after the production build, as a required gate that reads the build gate's own log", () => {
    const build = idx(/^B12 /), guard = idx(/^B13 /);
    expect(build).toBeGreaterThanOrEqual(0);
    expect(guard).toBe(build + 1);
    expect(steps[build]!.run).toContain("gate.sh build required");
    expect(steps[guard]!.run).toContain("gate.sh build-resolution required");
    expect(steps[guard]!.run).toContain("scripts/ci/assert-build-log.mjs");
    expect(steps[guard]!.run).toContain('logs/build.log'); // gate.sh writes logs/<gate id>.log; the id above is "build"
    expect(steps[guard]!.if).toBeUndefined(); // default: runs when the build succeeded; never skipped into a pass
    expect(fs.existsSync(path.join(root, "scripts/ci/assert-build-log.mjs"))).toBe(true);
  });
  it("is part of the summary's required gates, between build and app-start", async () => {
    const { REQUIRED_GATES } = await import(/* @vite-ignore */ path.join(root, "scripts/ci/summarize.mjs"));
    const i = REQUIRED_GATES.indexOf("build-resolution");
    expect(i).toBeGreaterThan(0);
    expect(REQUIRED_GATES[i - 1]).toBe("build");
    expect(REQUIRED_GATES[i + 1]).toBe("app-start");
  });
});

describe("docs/BRANCH_PROTECTION.md payloads stay in step with the workflow", () => {
  const doc = fs.readFileSync(path.join(root, "docs/BRANCH_PROTECTION.md"), "utf8");
  const blocks = [...doc.matchAll(/```json\n([\s\S]*?)```/g)].map((m) => JSON.parse(m[1]!) as Record<string, unknown>);
  const job = load(GATE).jobs.gate!.name;
  it("contains the two payloads, both valid JSON", () => {
    expect(blocks).toHaveLength(2);
  });
  it("both require exactly the job name the workflow produces, from the GitHub Actions app (id 15368), and both bind the default branch", () => {
    const classic = blocks[0] as { required_status_checks: { strict: boolean; checks: { context: string; app_id: number }[] }; allow_force_pushes: boolean; allow_deletions: boolean; enforce_admins: boolean };
    expect(classic.required_status_checks.checks).toEqual([{ context: job, app_id: 15368 }]);
    expect(classic).toMatchObject({ allow_force_pushes: false, allow_deletions: false, enforce_admins: true });
    expect(classic.required_status_checks.strict).toBe(true);
    const ruleset = blocks[1] as { conditions: { ref_name: { include: string[] } }; rules: { type: string; parameters?: { required_status_checks?: { context: string; integration_id: number }[]; strict_required_status_checks_policy?: boolean } }[] };
    expect(ruleset.conditions.ref_name.include).toEqual([`refs/heads/${DEFAULT_BRANCH}`]);
    const checks = ruleset.rules.find((r) => r.type === "required_status_checks")!.parameters!;
    expect(checks.required_status_checks).toEqual([{ context: job, integration_id: 15368 }]);
    expect(checks.strict_required_status_checks_policy).toBe(true);
    expect(ruleset.rules.map((r) => r.type)).toEqual(expect.arrayContaining(["deletion", "non_fast_forward", "pull_request", "required_status_checks"]));
  });
});
