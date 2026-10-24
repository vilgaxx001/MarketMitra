/**
 * MODULE 5B.5 tenant / authorization audit. STATIC (source-scan) and schema tests: they pin the structural
 * properties that make cross-tenant access impossible, so a future edit that breaks one fails loudly.
 * Behavioural cross-tenant tests (mocked repositories) live in memory/__tests__/service.test.ts,
 * preferences/__tests__/service.test.ts and core/__tests__/memory-integration.test.ts. None of this is a live-DB test.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createBusinessMemorySchema, updateBusinessMemorySchema, listBusinessMemoriesQuerySchema } from "@/modules/ai/memory/validators";
import { updateBusinessAIPreferencesSchema } from "@/modules/ai/preferences/validators";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
}
const WS = "src/app/api/v1/workspaces/[workspaceSlug]";
const aiRoutes = walk(join(ROOT, WS)).filter((p) => p.endsWith("route.ts") && /(ai-memories|ai-preferences|\/ai\/)/.test(p));
const rel = (p: string) => p.slice(ROOT.length + 1);

/** Strip comments so doc text cannot satisfy or trip a pattern. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("AI route inventory", () => {
  it("finds every memory, preferences and execute route (guards against the scan silently covering nothing)", () => {
    const names = aiRoutes.map(rel).sort();
    expect(names.length).toBeGreaterThanOrEqual(6);
    expect(names.filter((n) => n.includes("ai-memories")).length).toBe(4);
    expect(names.filter((n) => n.includes("ai-preferences")).length).toBeGreaterThanOrEqual(1);
    expect(names.filter((n) => n.endsWith("/ai/execute/route.ts")).length).toBe(1);
  });
});

describe("every AI route handler authorizes before touching the body or any service", () => {
  for (const file of aiRoutes) {
    const src = code(read(rel(file)));
    // one block per exported HTTP handler
    const handlers = src.split(/export const (?=GET|POST|PATCH|PUT|DELETE)/).slice(1);
    it(`${rel(file).replace(WS, "…")}: ${handlers.length} handler(s)`, () => {
      expect(handlers.length).toBeGreaterThan(0);
      for (const h of handlers) {
        const access = h.indexOf("requireWorkspaceAccess(");
        const perm = h.indexOf("requirePermission(");
        expect(access, "requireWorkspaceAccess missing").toBeGreaterThan(-1);
        expect(perm, "requirePermission missing").toBeGreaterThan(access);
        const firstUse = [h.search(/readBoundedJson\(/), h.search(/req\.json\(|request\.json\(/), h.search(/\b(await )?(create|list|get|update|delete|archive|restore|reset|execute)\w*\(/)]
          .filter((i) => i >= 0 && i !== perm)
          .map((i) => i)
          .sort((a, b) => a - b)[0];
        // the first body read / service call must come after authorization
        const afterPerm = h.slice(perm);
        expect(afterPerm).toMatch(/readBoundedJson\(|Service|\b(create|list|get|update|delete|archive|restore|reset)\w*\(|executeAICoreRequest\(/);
        if (firstUse !== undefined) expect(firstUse).toBeGreaterThan(perm);
      }
    });
    it(`${rel(file).replace(WS, "…")}: never uses a bare req.json() and never takes workspace/ownership from the client`, () => {
      expect(src).not.toMatch(/\.json\(\)/);
      // the workspace passed on is always the authorized user's
      expect(src).not.toMatch(/workspaceId:\s*(body|input|result\.data|query)\b/);
      expect(src).not.toMatch(/(body|input|result\.data|query\.data)\.workspaceId/);
      // every mention of workspaceId must be the authorized user's (workspaceSlug is a different identifier)
      for (const m of src.matchAll(/\bworkspaceId\b/g)) {
        expect(src.slice(Math.max(0, m.index! - 16), m.index! + 9 + 24), "unexpected workspaceId source").toMatch(/workspaceUser\.workspaceId|workspaceId:\s*workspaceUser/);
      }
    });
  }
  it("every route that forwards ids to a service forwards workspaceUser.workspaceId and workspaceUser.id (not request values) as workspace/actor", () => {
    for (const file of aiRoutes.filter((f) => !f.endsWith("/execute/route.ts"))) {
      const src = code(read(rel(file)));
      for (const m of src.matchAll(/\b(create|list|get|update|delete|archive|restore|reset)Business\w*\(([^)]*)\)/g)) {
        const args = m[2]!.split(",").map((a) => a.trim());
        expect(args, `${rel(file)}: ${m[0]}`).toContain("workspaceUser.workspaceId");
        // businessId/memoryId come from the path (or the validated id); nothing from the request body may name an owner
        expect(m[2]!.replace(/workspaceUser\.(workspaceId|id)\b/g, ""), `${rel(file)}: ${m[0]}`).not.toMatch(/\bbody\b|\.(workspaceId|businessId|createdById|updatedById)\b/);
      }
    }
  });
});

describe("services verify business ↔ workspace before the first data access", () => {
  const guardPattern = /assertBusinessInWorkspace\(|findByIdInWorkspace\(|requireBusinessAccess\(/;
  const dataPattern = /\brepo\.|\bdb\.|\bprisma\./;
  for (const file of ["src/modules/ai/memory/service.ts", "src/modules/ai/preferences/service.ts"]) {
    const src = code(read(file));
    // split into top-level exported functions
    const fns = src.split(/\nexport (?=(?:async )?function)/).slice(1);
    it(`${file}: finds exported functions`, () => expect(fns.length).toBeGreaterThanOrEqual(3));
    for (const fn of fns) {
      const name = /function (\w+)/.exec(fn)![1]!;
      it(`${file} → ${name}: guard precedes data access`, () => {
        const guard = fn.search(guardPattern);
        const data = fn.search(dataPattern);
        // archive/restore delegate to a private transition helper that carries the guard
        if (guard === -1 && data === -1) {
          expect(fn).toMatch(/transition\(|resolveEffective|assert/i);
          return;
        }
        expect(guard, `${name} touches data without verifying the business`).toBeGreaterThan(-1);
        if (data !== -1) expect(guard).toBeLessThan(data);
      });
    }
  }
  it("the shared transition helper (archive/restore) is guarded", () => {
    const src = code(read("src/modules/ai/memory/service.ts"));
    const helper = /async function transition[\s\S]*?\n}\n/.exec(src)?.[0] ?? "";
    expect(helper.length).toBeGreaterThan(0);
    expect(helper.search(guardPattern)).toBeGreaterThan(-1);
    expect(helper.search(guardPattern)).toBeLessThan(helper.search(dataPattern));
  });
  it("memory repository functions are always scoped by businessId in the where clause (no lookup by id alone)", () => {
    const src = code(read("src/modules/ai/memory/repository.ts"));
    expect(src).not.toMatch(/findUnique\(\s*\{\s*where:\s*\{\s*id\b/);
    expect(src).not.toMatch(/\.(update|delete)\(\s*\{\s*where:\s*\{\s*id\b/);
    expect(src).toMatch(/updateMany|deleteMany/);
  });
});

describe("client-supplied fields cannot reassign ownership or alter audit fields", () => {
  const forbidden = ["id", "businessId", "workspaceId", "createdById", "updatedById", "createdAt", "updatedAt", "status", "archivedAt", "deletedAt"];
  const base = { type: "BUSINESS_FACT", content: "We open at nine." };
  for (const f of forbidden) {
    it(`memory create rejects "${f}"`, () => expect(createBusinessMemorySchema.safeParse({ ...base, [f]: "x" }).success).toBe(false));
    it(`memory update rejects "${f}"`, () => expect(updateBusinessMemorySchema.safeParse({ content: "new text here", [f]: "x" }).success).toBe(false));
    it(`preferences update rejects "${f}"`, () => expect(updateBusinessAIPreferencesSchema.safeParse({ detailLevel: "CONCISE", [f]: "x" }).success).toBe(false));
  }
  it("memory list query rejects workspace/business overrides", () => {
    for (const k of ["businessId", "workspaceId", "createdById"]) expect(listBusinessMemoriesQuerySchema.safeParse({ [k]: "x" }).success).toBe(false);
  });
});

describe("audit-log metadata carries identifiers and field names only", () => {
  for (const file of ["src/modules/ai/memory/service.ts", "src/modules/ai/preferences/service.ts"]) {
    it(`${file}: no logActivity metadata references user-provided text`, () => {
      const src = code(read(file));
      const calls = [...src.matchAll(/logActivity\(\{[^\n]*\}\)/g)].map((m) => m[0]);
      expect(calls.length).toBeGreaterThanOrEqual(2);
      for (const c of calls) {
        const meta = /metadata:\s*(\{.*\})\s*\}\)/.exec(c)?.[1] ?? "";
                // allowed: identifiers, the validated enum `input.type`, and field NAMES via Object.keys(input)
        const stripped = meta.replace(/Object\.keys\(input\)/g, "").replace(/input\.type\b/g, "");
        expect(stripped, c).not.toMatch(/\binput\b|content|label|businessInstructions|behaviorConstraints/);
      }
    });
  }
});

describe("execution-time resolution uses the authorized business, after authorization", () => {
  const src = code(read("src/modules/ai/core/context/execution-context.service.ts"));
  it("preferences and memory are resolved only after requireBusinessAccess and the business-context lookup", () => {
    const a = src.indexOf("requireBusinessAccess(");
    const b = src.indexOf("resolveBusinessContext(");
    const p = src.indexOf("resolveEffectiveAIPreferences(");
    const m = src.indexOf("resolveBusinessMemory(");
    expect(a).toBeGreaterThan(-1);
    expect(b).toBeGreaterThan(a);
    expect(p).toBeGreaterThan(b);
    expect(m).toBeGreaterThan(p);
  });
  it("the workspace-match guard runs before authorization", () => {
    const g = src.indexOf("assertRequestWorkspaceMatches(");
    expect(g).toBeGreaterThan(-1);
    const fnStart = src.indexOf("export async function resolveExecutionContext");
    expect(src.indexOf("assertRequestWorkspaceMatches(", fnStart)).toBeGreaterThan(-1);
    expect(src.indexOf("assertRequestWorkspaceMatches(", fnStart)).toBeLessThan(src.indexOf("requireBusinessAccess(", fnStart));
  });
});
