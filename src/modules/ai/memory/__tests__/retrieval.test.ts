/** PURE logic tests (no mocks, no I/O): normalization, scoring, ordering, selection limits. */
import { describe, it, expect } from "vitest";
import {
  normalizeText, extractQueryTerms, scoreMemory, selectMemories, memoryRetrievalInputSchema,
  MEMORY_RETRIEVAL_LIMITS, RETRIEVAL_SCORING, type RetrievalCandidate,
} from "../retrieval";

const D = (s: string) => new Date(s);
let n = 0;
const cand = (o: Partial<RetrievalCandidate> = {}): RetrievalCandidate => ({
  id: `m${++n}`, type: "BUSINESS_FACT", label: null, content: "placeholder text zzz", expiresAt: null, createdAt: D("2026-01-01T00:00:00Z"), ...o,
});
const LIM = { maxResults: 20, maxContentChars: 8000 };

describe("query preparation", () => {
  it("normalizes case, whitespace, punctuation and NFKC forms", () => {
    expect(normalizeText("  Hello,\n\tWORLD!!  ")).toBe("hello world");
    expect(normalizeText("ＦＵＬＬ　ｗｉｄｔｈ")).toBe("full width");
  });
  it("drops stopwords, 1-char words, duplicates; keeps first-seen order", () => {
    expect(extractQueryTerms("The Shipping policy and a shipping POLICY x")).toEqual(["shipping", "policy"]);
  });
  it("caps the number of terms", () => {
    const q = Array.from({ length: 100 }, (_, i) => `term${i}`).join(" ");
    expect(extractQueryTerms(q)).toHaveLength(MEMORY_RETRIEVAL_LIMITS.maxQueryTerms);
  });
  it("regex metacharacters are inert (no pattern is built from the query)", () => {
    const nasty = "(a+)+$ .* [unclosed \\ ^ ?? {1,2} | ( ";
    expect(() => selectMemories([cand({ content: "a plain sentence" })], nasty, LIM)).not.toThrow();
    const hit = cand({ content: "the price is 5.5 (approx) a+b" });
    // punctuation is folded to spaces so "5.5" is tokens "5","5" (both < 2 chars) and "a+b" is "a","b": only words matter
    expect(selectMemories([hit], ".*", LIM).strategy).toBe("RECENCY");
    expect(selectMemories([hit], "approx.*", LIM).items.map((i) => i.id)).toEqual([hit.id]);
  });
  it("Devanagari words (combining marks) tokenize and match as whole words", () => {
    const hi = cand({ content: "हमारी दुकान दिल्ली में है" });
    const other = cand({ content: "हमारी वेबसाइट" });
    const r = selectMemories([hi, other], "दुकान दिल्ली", LIM);
    expect(r.items.map((i) => i.id)).toEqual([hi.id]);
  });
});

describe("1/2. relevant selection and irrelevant exclusion (LEXICAL_V1)", () => {
  const ship = cand({ label: "Shipping", content: "We ship within India in 3 days" });
  const tone = cand({ content: "Brand tone is friendly and casual" });
  const price = cand({ content: "Free shipping above 999 rupees" });
  it("returns only memories sharing a term, most relevant first, with no unrelated ones", () => {
    const r = selectMemories([tone, price, ship], "shipping rupees", LIM);
    expect(r.strategy).toBe("LEXICAL_V1");
    expect(r.items.map((i) => i.id)).toEqual([ship.id, price.id]); // ship: label 'shipping' = 3; price: content shipping+rupees (not contiguous) = 2
    expect(r.items.some((i) => i.id === tone.id)).toBe(false);
    expect(r.totalMatched).toBe(2);
  });
  it("is whole-word only: no stemming, no semantics", () => {
    const r = selectMemories([cand({ content: "we ship daily" })], "shipping", LIM);
    expect(r.items).toHaveLength(0);
    expect(r.totalMatched).toBe(0);
  });
  it("score components are exactly the documented weights", () => {
    const m = { label: "Refund policy", content: "Refund within 7 days. Our refund policy is strict" };
    const s = scoreMemory(["refund", "policy"], "refund policy", m);
    expect(s).toEqual({
      reason: "LEXICAL_MATCH", matchedTermCount: 2, labelTermMatches: 2, contentTermMatches: 2, phraseMatch: true,
      score: 2 * RETRIEVAL_SCORING.labelTermWeight + 2 * RETRIEVAL_SCORING.contentTermWeight + RETRIEVAL_SCORING.phraseBonus,
    });
  });
  it("label matches outweigh content matches; phrase bonus needs a contiguous word sequence", () => {
    const labelHit = scoreMemory(["offer"], "offer", { label: "Offer", content: "x" });
    const contentHit = scoreMemory(["offer"], "offer", { label: null, content: "an offer" });
    expect(labelHit.score).toBeGreaterThan(contentHit.score);
    const split = scoreMemory(["red", "shoes"], "red shoes", { label: null, content: "red leather shoes" });
    expect(split.phraseMatch).toBe(false);
    expect(split.score).toBe(2);
  });
  it("a single-term query never earns the phrase bonus", () => {
    expect(scoreMemory(["offer"], "offer", { label: null, content: "offer" }).phraseMatch).toBe(false);
  });
});

describe("3. deterministic tie-breaking", () => {
  it("equal score => newer createdAt first; equal createdAt => id ascending; input order is irrelevant", () => {
    const a = cand({ id: "a", content: "alpha beta", createdAt: D("2026-03-01T00:00:00Z") });
    const b = cand({ id: "b", content: "alpha beta", createdAt: D("2026-03-01T00:00:00Z") });
    const c = cand({ id: "c", content: "alpha beta", createdAt: D("2026-04-01T00:00:00Z") });
    const d = cand({ id: "d", content: "alpha beta", createdAt: D("2026-02-01T00:00:00Z") });
    const expected = ["c", "a", "b", "d"];
    const perms = [[a, b, c, d], [d, c, b, a], [b, d, a, c], [c, a, d, b]];
    for (const p of perms) expect(selectMemories(p, "alpha", LIM).items.map((i) => i.id)).toEqual(expected);
  });
  it("id comparison is code-point based, not locale based", () => {
    const upper = cand({ id: "B", content: "alpha" });
    const lower = cand({ id: "a", content: "alpha" });
    expect(selectMemories([lower, upper], "alpha", LIM).items.map((i) => i.id)).toEqual(["B", "a"]);
  });
  it("higher score beats newer date", () => {
    const old = cand({ id: "old", label: "alpha", content: "x", createdAt: D("2020-01-01T00:00:00Z") });
    const fresh = cand({ id: "fresh", content: "alpha", createdAt: D("2026-01-01T00:00:00Z") });
    expect(selectMemories([fresh, old], "alpha", LIM).items.map((i) => i.id)).toEqual(["old", "fresh"]);
  });
  it("repeated runs are identical", () => {
    const set = Array.from({ length: 12 }, (_, i) => cand({ id: `x${i}`, content: i % 2 ? "alpha" : "alpha beta", createdAt: D(`2026-01-${10 + (i % 3)}T00:00:00Z`) }));
    const first = JSON.stringify(selectMemories(set, "alpha beta", LIM));
    for (let i = 0; i < 5; i++) expect(JSON.stringify(selectMemories([...set].reverse(), "alpha beta", LIM))).toBe(first);
  });
});

describe("9. empty queries use the documented RECENCY strategy (not fake relevance)", () => {
  const old = cand({ id: "o", createdAt: D("2025-01-01T00:00:00Z") });
  const mid = cand({ id: "m", createdAt: D("2025-06-01T00:00:00Z") });
  const fresh = cand({ id: "f", createdAt: D("2026-01-01T00:00:00Z") });
  it.each(["", "   ", "\n\t", "the and of", "a b c", "!!! ???"])("query %j => RECENCY, newest first, RECENCY_ONLY score 0", (q) => {
    const r = selectMemories([old, fresh, mid], q, LIM);
    expect(r.strategy).toBe("RECENCY");
    expect(r.queryTermCount).toBe(0);
    expect(r.items.map((i) => i.id)).toEqual(["f", "m", "o"]);
    for (const i of r.items) expect(i.relevance).toMatchObject({ reason: "RECENCY_ONLY", score: 0, matchedTermCount: 0 });
  });
});

describe("10/11/12. limits and no-match", () => {
  it("maxResults is strict and flags resultLimitReached", () => {
    const set = Array.from({ length: 6 }, (_, i) => cand({ id: `r${i}`, content: "alpha", createdAt: D(`2026-01-0${i + 1}T00:00:00Z`) }));
    const r = selectMemories(set, "alpha", { maxResults: 3, maxContentChars: 8000 });
    expect(r.items).toHaveLength(3);
    expect(r.totalMatched).toBe(6);
    expect(r.resultLimitReached).toBe(true);
    expect(r.contentBudgetReached).toBe(false);
  });
  it("exactly maxResults matches does not flag the limit", () => {
    const set = [cand({ content: "alpha" }), cand({ content: "alpha" })];
    expect(selectMemories(set, "alpha", { maxResults: 2, maxContentChars: 8000 }).resultLimitReached).toBe(false);
  });
  it("content budget counts label+content, never truncates, skips what does not fit and continues with smaller items", () => {
    const big = cand({ id: "big", label: "L".repeat(10), content: "alpha " + "x".repeat(190), createdAt: D("2026-03-01T00:00:00Z") }); // 206
    const small = cand({ id: "small", content: "alpha ok", createdAt: D("2026-01-01T00:00:00Z") }); // 8
    const r = selectMemories([big, small], "alpha", { maxResults: 5, maxContentChars: 100 });
    expect(r.items.map((i) => i.id)).toEqual(["small"]);
    expect(r.contentBudgetReached).toBe(true);
    expect(r.contentCharsUsed).toBe(8);
    expect(r.contentCharsUsed).toBeLessThanOrEqual(100);
    expect(r.items[0]!.content).toBe("alpha ok"); // untruncated
  });
  it("total selected content never exceeds the budget; exact fit is allowed", () => {
    const set = Array.from({ length: 10 }, (_, i) => cand({ id: `b${i}`, content: "alpha " + "y".repeat(34), createdAt: D(`2026-01-${10 + i}T00:00:00Z`) })); // 40 each
    const r = selectMemories(set, "alpha", { maxResults: 20, maxContentChars: 120 });
    expect(r.items).toHaveLength(3);
    expect(r.contentCharsUsed).toBe(120);
    expect(r.contentBudgetReached).toBe(true);
  });
  it("no matching memories => explicit empty selection", () => {
    const r = selectMemories([cand({ content: "completely different" })], "quantum", LIM);
    expect(r).toMatchObject({ strategy: "LEXICAL_V1", items: [], totalMatched: 0, contentCharsUsed: 0, resultLimitReached: false, contentBudgetReached: false });
  });
  it("no candidates at all => empty under both strategies", () => {
    expect(selectMemories([], "alpha", LIM).items).toEqual([]);
    expect(selectMemories([], "", LIM).items).toEqual([]);
  });
  it("output items are plain DTOs with only the contract fields (no row leakage)", () => {
    const row = { ...cand({ content: "alpha" }), businessId: "SECRET", metadata: { k: 1 }, createdById: "u" } as RetrievalCandidate;
    const [item] = selectMemories([row], "alpha", LIM).items;
    expect(Object.keys(item!).sort()).toEqual(["content", "expiresAt", "id", "label", "relevance", "status", "type"]);
  });
});

describe("13. input schema (malformed inputs)", () => {
  const ok = { workspaceId: "ws1", businessId: "b1" };
  it("applies documented defaults", () => {
    expect(memoryRetrievalInputSchema.parse(ok)).toEqual({ ...ok, query: "", maxResults: 8, maxContentChars: 4000 });
  });
  it("accepts a query at exactly the limit and rejects one above it (no truncation)", () => {
    expect(memoryRetrievalInputSchema.safeParse({ ...ok, query: "a".repeat(500) }).success).toBe(true);
    expect(memoryRetrievalInputSchema.safeParse({ ...ok, query: "a".repeat(501) }).success).toBe(false);
  });
  it.each([
    ["non-string query", { query: 42 }], ["null query", { query: null }], ["object query", { query: { $ne: "" } }],
    ["unknown type", { types: ["SECRET"] }], ["empty types", { types: [] }], ["types not array", { types: "BUSINESS_FACT" }],
    ["too many types", { types: ["BUSINESS_FACT", "BUSINESS_PREFERENCE", "BUSINESS_GOAL", "BUSINESS_CONSTRAINT", "BUSINESS_GOAL"] }],
    ["maxResults 0", { maxResults: 0 }], ["maxResults 21", { maxResults: 21 }], ["maxResults float", { maxResults: 1.5 }], ["maxResults string", { maxResults: "5" }], ["maxResults NaN", { maxResults: NaN }],
    ["budget 99", { maxContentChars: 99 }], ["budget 8001", { maxContentChars: 8001 }], ["budget Infinity", { maxContentChars: Infinity }],
    ["unknown field", { includeArchived: true }], ["status override", { status: "ARCHIVED" }],
  ])("rejects %s", (_n, extra) => {
    expect(memoryRetrievalInputSchema.safeParse({ ...ok, ...extra }).success).toBe(false);
  });
  it.each([["missing workspaceId", { businessId: "b" }], ["missing businessId", { workspaceId: "w" }], ["empty ids", { workspaceId: "", businessId: "" }], ["numeric ids", { workspaceId: 1, businessId: 2 }], ["oversized id", { workspaceId: "w", businessId: "b".repeat(65) }]])("rejects %s", (_n, input) => {
    expect(memoryRetrievalInputSchema.safeParse(input).success).toBe(false);
  });
  it.each([undefined, null, "str", 5, []])("rejects non-object input %j", (input) => {
    expect(memoryRetrievalInputSchema.safeParse(input).success).toBe(false);
  });
});
