/**
 * Structural guard: no API route may read a request body except through readBoundedJson, and every route that reads one must
 * pass an explicit limit. Failing here means a route was added or changed in a way that bypasses the shared byte limit.
 * Also pins the inventory (route -> limit class -> rate-limit endpoint) so a change to it is a deliberate, reviewed edit.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../../app/api");
function routes(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? routes(p) : n === "route.ts" ? [p] : [];
  });
}
const files = routes(ROOT);
const rel = (f: string) => path.relative(ROOT, f).split(path.sep).join("/");
const src = (f: string) => readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("no route reads a request body directly", () => {
  const direct = /\b(?:req|request)\s*\.\s*(?:json|text|formData|arrayBuffer|blob|body)\b|\bnew\s+Response\s*\(\s*(?:req|request)\.body/;
  it("scans a plausible number of routes", () => expect(files.length).toBeGreaterThan(40));
  it.each(files.map((f) => [rel(f), f]))("%s", (_r, f) => {
    expect(src(f as string)).not.toMatch(direct);
  });
});

describe("every body-reading route passes an explicit limit to the shared reader", () => {
  const readers = files.filter((f) => /readBoundedJson\s*\(/.test(src(f)));
  it("finds the audited set", () => expect(readers.length).toBe(25));
  it.each(readers.map((f) => [rel(f), f]))("%s", (_r, f) => {
    const s = src(f as string);
    // either a BODY_LIMITS class, a named module constant, or the memory module's wrapper, whose own default is MAX_MEMORY_REQUEST_BYTES
    expect(s).toMatch(/readBoundedJson\s*\(\s*req\s*(?:,\s*(?:BODY_LIMITS\.\w+|[A-Z][A-Z0-9_]+)\s*)?\)/);
    // the parse result must be checked before use
    expect(s).toMatch(/\.ok\b/);
  });
});

describe("audited inventory", () => {
  const W = "workspaces/[workspaceSlug]"; const B = `${W}/businesses/[businessId]`;
  // route -> [limit class, rate-limited endpoint or null]
  const inventory: Record<string, [string, string | null]> = {
    "auth/login/route.ts": ["auth", "login"], "auth/signup/route.ts": ["auth", "signup"],
    "auth/forgot-password/route.ts": ["auth", "forgotPassword"], "auth/reset-password/route.ts": ["auth", "resetPassword"],
    "auth/verify-email/route.ts": ["auth", "verifyEmail"], "contact/route.ts": ["publicForm", "contact"],
    "ai/demo-generate/route.ts": ["publicForm", "demoGenerate"],
    "invites/accept/route.ts": ["control", null], "onboarding/start/route.ts": ["profile", null], "workspaces/route.ts": ["control", null],
    [`${W}/route.ts`]: ["control", null], [`${W}/assets/confirm-upload/route.ts`]: ["control", null], [`${W}/assets/initiate-upload/route.ts`]: ["control", null],
    [`${W}/onboarding/step/route.ts`]: ["profile", null], [`${W}/team/invites/route.ts`]: ["control", null], [`${W}/team/members/[userId]/route.ts`]: ["control", null],
    [`${W}/businesses/route.ts`]: ["profile", null], [`${B}/route.ts`]: ["profile", null], [`${B}/brand/route.ts`]: ["profile", null],
    [`${B}/audience/route.ts`]: ["profile", null], [`${B}/audience/[segmentId]/route.ts`]: ["profile", null],
  };
  it.each(Object.entries(inventory))("%s", (route, [cls, endpoint]) => {
    const s = src(path.join(ROOT, "v1", route));
    expect(s).toContain(`BODY_LIMITS.${cls}`);
    if (endpoint) expect(s).toContain(`"${endpoint}"`);
    else expect(s).not.toMatch(/enforceIpLimit/); // authenticated routes are throttled by their session + permission checks, not by this limiter
  });
  it("the 4 AI routes that already used the reader keep their own documented limits", () => {
    for (const r of [`${W}/ai/execute/route.ts`, `${B}/ai-memories/route.ts`, `${B}/ai-memories/[memoryId]/route.ts`, `${B}/ai-preferences/route.ts`]) {
      expect(src(path.join(ROOT, "v1", r))).toMatch(/readBoundedJson\s*\(/);
    }
  });
  it("every public (unauthenticated) route that mutates is in the rate-limited set", () => {
    const publicRoutes = files.filter((f) => !/requireAuth|requireWorkspaceAccess|getCurrentSession|requirePlatformAdmin|webhook/i.test(src(f)) && /export const (POST|PUT|PATCH|DELETE)/.test(src(f)));
    const limited = publicRoutes.filter((f) => /enforceIpLimit/.test(src(f))).map(rel).sort();
    expect(limited).toEqual(Object.entries(inventory).filter(([, [, e]]) => e).map(([r]) => r.replace(/^/, "v1/")).sort());
  });
});
