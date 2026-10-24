/**
 * Module boundaries around memory.
 *  - 5B.2/5B.3 originally asserted "memory is not wired into AI Core".
 *  - 5B.4 deliberately changes that. These tests now pin the ONLY allowed integration:
 *    AI Core may import exactly `retrieval.service` (the authorized retrieval entry point),
 *    `context` (pure query builder + renderer) and `retrieval` (types); only
 *    `context/execution-context.service.ts` may CALL retrieval; the orchestrator never touches
 *    memory directly; and AI Core never reaches the memory table, CRUD service or repositories.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) return n === "__tests__" ? [] : sources(p);
    return p.endsWith(".ts") ? [p] : [];
  });
}
const CORE = path.join(process.cwd(), "src/modules/ai/core");

const ALLOWED_CORE_MEMORY_IMPORTS = new Set(["@/modules/ai/memory/retrieval.service", "@/modules/ai/memory/context", "@/modules/ai/memory/retrieval"]);
function memoryImports(text: string): string[] {
  return [...text.matchAll(/from\s+"([^"]*ai\/memory[^"]*)"/g)].map((m) => m[1]!);
}

describe("memory integration boundary in AI Core (5B.4: deliberate, allowlisted)", () => {
  it("AI Core imports only the allowlisted memory entry points and never the memory table, CRUD service or repositories", () => {
    for (const f of sources(CORE)) {
      const text = readFileSync(f, "utf8");
      for (const imp of memoryImports(text)) expect(ALLOWED_CORE_MEMORY_IMPORTS.has(imp), `${f} imports ${imp}`).toBe(true);
      expect(text, f).not.toMatch(/\bdb\.|prisma\.|\$queryRaw|retrieval\.repository|ai\/memory\/(?:service|repository|http|index)|ai\/memory"/);
    }
  });
  it("CoreExecutionContext has exactly the documented fields (5B.4 added businessMemory)", () => {
    const text = readFileSync(path.join(CORE, "types/execution-context.ts"), "utf8");
    const iface = text.slice(text.indexOf("export interface CoreExecutionContext"));
    const body = iface.slice(iface.indexOf("{"), iface.indexOf("\n}"));
    const fields = [...body.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/(\w+):/g)].map((m) => m[1]).sort();
    expect(fields).toEqual(["actorUserId", "businessContext", "businessId", "businessMemory", "businessPreferences", "workspaceId"]);
  });
  it("AI Core contains no direct Module 4 table queries", () => {
    for (const f of sources(CORE)) expect(readFileSync(f, "utf8"), f).not.toMatch(/\bdb\.(businessProfile|brandIdentity|audienceSegment)\b/);
  });
  it("the memory module itself performs no AI calls, embedding or retrieval (code, comments excluded)", () => {
    for (const f of sources(path.join(process.cwd(), "src/modules/ai/memory"))) {
      const code = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      expect(code, f).not.toMatch(/executeAICoreRequest|from\s+"[^"]*(openai|anthropic|generative-ai|ai\/core)/i);
      expect(code, f).not.toMatch(/embedding|vector/i);
    }
  });
});

describe("retrieval call sites (5B.3 service, 5B.4 integration)", () => {
  const MEM = path.join(process.cwd(), "src/modules/ai/memory");
  const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  it("only context/execution-context.service.ts calls retrieveBusinessMemories; routes and the orchestrator do not reference retrieval or memory", () => {
    const callers = sources(path.join(process.cwd(), "src/modules/ai/core")).filter((f) => /retrieveBusinessMemories\s*\(/.test(strip(readFileSync(f, "utf8"))));
    expect(callers.map((f) => path.relative(CORE, f))).toEqual(["context/execution-context.service.ts"]);
    expect(readFileSync(path.join(CORE, "orchestrator.ts"), "utf8")).not.toMatch(/ai\/memory|retrieveBusinessMemories|businessMemory/);
    for (const f of sources(path.join(process.cwd(), "src/app"))) expect(readFileSync(f, "utf8"), f).not.toMatch(/retrieveBusinessMemories|memory\/retrieval|findRetrievalCandidates|selectMemories|memory\/context/);
  });
  it("retrieval.ts (scoring/selection) performs no I/O: no db, logger, fs, network or repository imports", () => {
    const code = strip(readFileSync(path.join(MEM, "retrieval.ts"), "utf8"));
    expect(code).not.toMatch(/@\/lib\/db|@\/lib\/logger|node:|\bfetch\(|repository/);
  });
  it("only retrieval.repository.ts touches the database, and never builds a RegExp or raw SQL from input", () => {
    const code = strip(readFileSync(path.join(MEM, "retrieval.service.ts"), "utf8") + readFileSync(path.join(MEM, "retrieval.ts"), "utf8"));
    expect(code).not.toMatch(/\bdb\./);
    expect(code).not.toMatch(/new RegExp|\$queryRaw|\$executeRaw|\.test\(|\.exec\(/);
    const repoCode = strip(readFileSync(path.join(MEM, "retrieval.repository.ts"), "utf8"));
    expect(repoCode).not.toMatch(/\$queryRaw|\$executeRaw|\.(update|delete|create|upsert)\w*\(/);
  });
  it("memory/context.ts is pure: no db, logger, fs, network, repository or AI Core imports", () => {
    const code = strip(readFileSync(path.join(MEM, "context.ts"), "utf8"));
    expect(code).not.toMatch(/@\/lib\/db|@\/lib\/logger|node:|\bfetch\(|repository|ai\/core|new RegExp|\$queryRaw/);
  });
});
