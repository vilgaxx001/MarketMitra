/** MOCKED service tests (business lookup, retrieval repository and logger are test doubles; selection logic is the real implementation). */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/api-response", () => ({
  ApiException: class ApiException extends Error { constructor(public code: string, message: string) { super(message); } },
}));
const log = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: log }));
vi.mock("@/modules/business/repository", () => ({ findByIdInWorkspace: vi.fn() }));
vi.mock("../retrieval.repository", () => ({ findRetrievalCandidates: vi.fn() }));

import * as businessRepo from "@/modules/business/repository";
import * as repo from "../retrieval.repository";
import { retrieveBusinessMemories } from "../retrieval.service";

const NOW = new Date("2026-06-01T00:00:00Z");
const SECRET_QUERY = "ZQX-SECRET-QUERY-31337 refund";
const SECRET_CONTENT = "ZQX-SECRET-CONTENT-8841";
const SECRET_LABEL = "ZQX-SECRET-LABEL-552";
let n = 0;
const row = (o: object = {}) => ({
  id: `m${++n}`, type: "BUSINESS_FACT", label: null, content: "filler", expiresAt: null, createdAt: new Date("2026-01-01T00:00:00Z"), ...o,
});
const base = { workspaceId: "ws1", businessId: "biz1" };

beforeEach(() => {
  vi.resetAllMocks();
  n = 0;
  vi.mocked(businessRepo.findByIdInWorkspace).mockResolvedValue({ id: "biz1" } as never);
  vi.mocked(repo.findRetrievalCandidates).mockResolvedValue([]);
});

describe("8/7. authorization and tenant isolation", () => {
  it("business outside the authorized workspace (or missing) => NOT_FOUND, no memory read, identical to a missing business", async () => {
    vi.mocked(businessRepo.findByIdInWorkspace).mockResolvedValue(null);
    const foreign = await retrieveBusinessMemories({ workspaceId: "ws1", businessId: "other-ws-biz", query: "refund" }).catch((e) => e);
    const missing = await retrieveBusinessMemories({ workspaceId: "ws1", businessId: "nonexistent", query: "refund" }).catch((e) => e);
    expect(foreign).toMatchObject({ code: "NOT_FOUND", message: "Business not found." });
    expect(missing.code).toBe(foreign.code);
    expect(missing.message).toBe(foreign.message);
    expect(businessRepo.findByIdInWorkspace).toHaveBeenCalledWith("other-ws-biz", "ws1");
    expect(repo.findRetrievalCandidates).not.toHaveBeenCalled();
  });
  it("business membership is verified BEFORE any memory query, with the exact workspace/business pair", async () => {
    const order: string[] = [];
    vi.mocked(businessRepo.findByIdInWorkspace).mockImplementation((async () => { order.push("auth"); return { id: "biz1" }; }) as never);
    vi.mocked(repo.findRetrievalCandidates).mockImplementation((async () => { order.push("read"); return []; }) as never);
    await retrieveBusinessMemories({ ...base, query: "x1" });
    expect(order).toEqual(["auth", "read"]);
    expect(businessRepo.findByIdInWorkspace).toHaveBeenCalledWith("biz1", "ws1");
  });
  it("cross-business isolation: the repository is only ever asked for the authorized business, and result.businessId is that business", async () => {
    const r = await retrieveBusinessMemories({ ...base, query: "refund" });
    expect(repo.findRetrievalCandidates).toHaveBeenCalledTimes(1);
    expect(vi.mocked(repo.findRetrievalCandidates).mock.calls[0]![0]).toBe("biz1");
    expect(r.businessId).toBe("biz1");
  });
  it("a caller cannot widen scope with extra fields (strict input)", async () => {
    await expect(retrieveBusinessMemories({ ...base, businessIds: ["a", "b"] } as never)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(businessRepo.findByIdInWorkspace).not.toHaveBeenCalled();
    expect(repo.findRetrievalCandidates).not.toHaveBeenCalled();
  });
});

describe("selection through the service", () => {
  it("1/2. returns relevant memories as DTOs and excludes irrelevant ones", async () => {
    const hit = row({ label: "Refunds", content: "Refunds within 7 days", type: "BUSINESS_CONSTRAINT" });
    const miss = row({ content: "Our logo is blue" });
    vi.mocked(repo.findRetrievalCandidates).mockResolvedValue([miss, hit] as never);
    const r = await retrieveBusinessMemories({ ...base, query: "refunds" }, { now: NOW });
    expect(r.contentTrust).toBe("UNTRUSTED_BUSINESS_DATA");
    expect(r.strategy).toBe("LEXICAL_V1");
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toMatchObject({ id: hit.id, type: "BUSINESS_CONSTRAINT", label: "Refunds", status: "ACTIVE", relevance: { reason: "LEXICAL_MATCH", score: 4 } });
    expect(r).toMatchObject({ totalMatched: 1, totalSelected: 1, noMatches: false, candidatesConsidered: 2, resultLimitReached: false, contentBudgetReached: false });
  });
  it("4. types are de-duplicated and forwarded to the repository together with `now` and the candidate cap", async () => {
    await retrieveBusinessMemories({ ...base, query: "x1", types: ["BUSINESS_GOAL", "BUSINESS_GOAL", "BUSINESS_PREFERENCE"] }, { now: NOW });
    expect(repo.findRetrievalCandidates).toHaveBeenCalledWith("biz1", { types: ["BUSINESS_GOAL", "BUSINESS_PREFERENCE"], now: NOW, limit: 500 });
  });
  it("omits the type filter when none was given; `now` defaults to the current time", async () => {
    const before = Date.now();
    await retrieveBusinessMemories({ ...base });
    const opts = vi.mocked(repo.findRetrievalCandidates).mock.calls[0]![1];
    expect(opts.types).toBeUndefined();
    expect(opts.now.getTime()).toBeGreaterThanOrEqual(before);
  });
  it("5/6. archived/expired exclusion is delegated to the repository query; the service passes ONLY `now` for that decision and never re-adds rows", async () => {
    // The repository double returns nothing (as the DB would for archived/expired rows); the service must not invent rows.
    const r = await retrieveBusinessMemories({ ...base, query: "refund" }, { now: NOW });
    expect(r.items).toEqual([]);
    expect(vi.mocked(repo.findRetrievalCandidates).mock.calls[0]![1].now).toBe(NOW);
  });
  it("10. strict maximum result count with flag", async () => {
    vi.mocked(repo.findRetrievalCandidates).mockResolvedValue(Array.from({ length: 6 }, (_, i) => row({ content: "refund", createdAt: new Date(2026, 0, i + 1) })) as never);
    const r = await retrieveBusinessMemories({ ...base, query: "refund", maxResults: 2 });
    expect(r.items).toHaveLength(2);
    expect(r.totalSelected).toBe(2);
    expect(r.totalMatched).toBe(6);
    expect(r.resultLimitReached).toBe(true);
    expect(r.maxResults).toBe(2);
  });
  it("11. total content budget with flag", async () => {
    vi.mocked(repo.findRetrievalCandidates).mockResolvedValue(Array.from({ length: 5 }, (_, i) => row({ content: "refund " + "z".repeat(43), createdAt: new Date(2026, 0, i + 1) })) as never); // 50 each
    const r = await retrieveBusinessMemories({ ...base, query: "refund", maxContentChars: 120 });
    expect(r.items).toHaveLength(2);
    expect(r.contentCharsUsed).toBe(100);
    expect(r.contentCharsUsed).toBeLessThanOrEqual(r.maxContentChars);
    expect(r.contentBudgetReached).toBe(true);
    expect(r.resultLimitReached).toBe(false);
  });
  it("12. no matches is explicit, not an error", async () => {
    vi.mocked(repo.findRetrievalCandidates).mockResolvedValue([row({ content: "unrelated" })] as never);
    const r = await retrieveBusinessMemories({ ...base, query: "quantum" });
    expect(r).toMatchObject({ items: [], totalSelected: 0, totalMatched: 0, noMatches: true, strategy: "LEXICAL_V1", candidatesConsidered: 1 });
  });
  it("9. empty / whitespace / stopword-only queries use RECENCY (newest first); an empty business is noMatches", async () => {
    vi.mocked(repo.findRetrievalCandidates).mockResolvedValue([row({ id: "old", createdAt: new Date("2025-01-01") }), row({ id: "new", createdAt: new Date("2026-01-01") })] as never);
    for (const q of [undefined, "", "   ", "the of and"]) {
      const r = await retrieveBusinessMemories({ ...base, ...(q === undefined ? {} : { query: q }) });
      expect(r.strategy).toBe("RECENCY");
      expect(r.items.map((i) => i.id)).toEqual(["new", "old"]);
      expect(r.items[0]!.relevance).toMatchObject({ reason: "RECENCY_ONLY", score: 0 });
    }
    vi.mocked(repo.findRetrievalCandidates).mockResolvedValue([]);
    expect((await retrieveBusinessMemories({ ...base, query: "" })).noMatches).toBe(true);
  });
  it("candidateLimitReached is flagged when the candidate cap is hit", async () => {
    vi.mocked(repo.findRetrievalCandidates).mockResolvedValue(Array.from({ length: 500 }, (_, i) => row({ id: `c${i}` })) as never);
    expect((await retrieveBusinessMemories({ ...base, query: "" })).candidateLimitReached).toBe(true);
  });
  it("does not return raw database fields even if the repository leaks extra columns", async () => {
    vi.mocked(repo.findRetrievalCandidates).mockResolvedValue([row({ content: "refund", businessId: "LEAK", metadata: { a: 1 }, createdById: "LEAK-U" })] as never);
    const [item] = (await retrieveBusinessMemories({ ...base, query: "refund" })).items;
    expect(Object.keys(item!).sort()).toEqual(["content", "expiresAt", "id", "label", "relevance", "status", "type"]);
    expect(JSON.stringify(item)).not.toContain("LEAK");
  });
});

describe("9/13. oversized and malformed input", () => {
  it("rejects a query above 500 characters with a generic error that does not echo the query; no reads happen", async () => {
    const err = await retrieveBusinessMemories({ ...base, query: SECRET_QUERY + "x".repeat(600) }).catch((e) => e);
    expect(err).toMatchObject({ code: "VALIDATION_ERROR", message: "Invalid memory retrieval request." });
    expect(String(err.message)).not.toContain("ZQX");
    expect(businessRepo.findByIdInWorkspace).not.toHaveBeenCalled();
    expect(repo.findRetrievalCandidates).not.toHaveBeenCalled();
  });
  it("accepts exactly 500 characters", async () => {
    await expect(retrieveBusinessMemories({ ...base, query: "a".repeat(500) })).resolves.toBeTruthy();
  });
  it.each([
    ["null input", null], ["string input", "refund"], ["array input", []], ["missing ids", {}],
    ["non-string query", { ...base, query: 5 }], ["bad types", { ...base, types: ["NOPE"] }], ["empty types", { ...base, types: [] }],
    ["maxResults 0", { ...base, maxResults: 0 }], ["maxResults 999", { ...base, maxResults: 999 }], ["budget 1", { ...base, maxContentChars: 1 }], ["budget 1e9", { ...base, maxContentChars: 1e9 }],
    ["prototype pollution key", JSON.parse('{"workspaceId":"w","businessId":"b","__proto__":{"x":1}}')],
  ])("%s => VALIDATION_ERROR, nothing read", async (_n, input) => {
    await expect(retrieveBusinessMemories(input as never)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(businessRepo.findByIdInWorkspace).not.toHaveBeenCalled();
    expect(repo.findRetrievalCandidates).not.toHaveBeenCalled();
  });
});

describe("14. no raw content in logs", () => {
  it("success path logs counts/strategy only: never the query, labels or memory content", async () => {
    vi.mocked(repo.findRetrievalCandidates).mockResolvedValue([row({ label: SECRET_LABEL, content: `${SECRET_CONTENT} refund` })] as never);
    await retrieveBusinessMemories({ ...base, query: SECRET_QUERY });
    const logged = JSON.stringify(Object.values(log).flatMap((f) => f.mock.calls));
    expect(log.debug).toHaveBeenCalledTimes(1);
    expect(logged).toContain("memory.retrieval");
    for (const secret of [SECRET_QUERY, "ZQX", SECRET_CONTENT, SECRET_LABEL]) expect(logged).not.toContain(secret);
    const entry = log.debug.mock.calls[0]![0];
    expect(Object.keys(entry).sort()).toEqual([
      "businessId", "candidatesConsidered", "contentBudgetReached", "contentCharsUsed", "msg", "queryTermCount", "resultLimitReached", "strategy", "totalMatched", "totalSelected",
    ]);
  });
  it("failure paths (validation, not found) log nothing containing the query", async () => {
    vi.mocked(businessRepo.findByIdInWorkspace).mockResolvedValue(null);
    await retrieveBusinessMemories({ ...base, query: SECRET_QUERY }).catch(() => undefined);
    await retrieveBusinessMemories({ ...base, query: SECRET_QUERY + "x".repeat(600) }).catch(() => undefined);
    expect(JSON.stringify(Object.values(log).flatMap((f) => f.mock.calls))).not.toContain("ZQX");
  });
});
