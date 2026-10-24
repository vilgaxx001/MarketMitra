/**
 * src/modules/ai/memory/retrieval.ts
 *
 * MODULE 5B.3 — deterministic, business-scoped memory retrieval: contract,
 * validation and the PURE scoring/selection logic (no I/O here).
 *
 * WHAT THIS IS: exact-token LEXICAL matching with an integer score. It has
 * no semantic understanding: "ship" does not match "shipping", synonyms and
 * translations do not match, and relevance beyond shared words is not
 * inferred. Memory text stays untrusted DATA; nothing here adds
 * instructions to it, and nothing here calls a model.
 *
 * STRATEGIES (reported in every result)
 *  - LEXICAL_V1: the query has >=1 usable term. Only memories sharing at
 *    least one term are returned; everything else is excluded.
 *  - RECENCY: the query is empty / whitespace / has no usable terms (only
 *    stopwords or 1-character words). There is nothing to rank by, so the
 *    result is the newest usable memories, each flagged RECENCY_ONLY with
 *    score 0. It is a documented deterministic fallback, not relevance.
 *
 * QUERY PREPARATION: NFKC-normalize, lowercase, replace every run of
 * characters that are not letters/marks/digits with one space (so
 * punctuation and "regex" characters are inert; no pattern is ever built
 * from the query), split on spaces, drop terms shorter than 2 UTF-16 units
 * and English stopwords, de-duplicate, keep the first 32 terms. Limits:
 * English-only stopwords; locale-specific case folding is not applied;
 * single-character words (e.g. many CJK words) are not matchable.
 *
 * SCORE (integers, summed per memory over the distinct query terms):
 *   +3 per term found in the label's tokens
 *   +1 per term found in the content's tokens
 *   +2 if the whole normalized query (>=2 terms) occurs as a contiguous
 *      word sequence in the label or the content
 * A memory with zero matching terms is not a match (score 0 is never
 * returned under LEXICAL_V1).
 *
 * ORDER (total, deterministic): score desc, then createdAt desc, then id asc
 * (code-point comparison, locale-independent).
 *
 * SELECTION (greedy in that order): stop at maxResults; otherwise an item
 * is skipped — never truncated — if label+content characters would exceed
 * the remaining budget, and later, smaller items may still fit.
 */
import { z } from "zod";
import { BUSINESS_MEMORY_TYPES, MEMORY_LIMITS } from "./types";
import type { BusinessMemoryTypeValue } from "./types";

export const MEMORY_RETRIEVAL_LIMITS = {
  queryMaxLength: 500,
  maxQueryTerms: 32,
  termMinLength: 2,
  maxResultsDefault: 8,
  maxResultsMax: 20,
  maxContentCharsDefault: 4_000,
  maxContentCharsMin: 100,
  maxContentCharsMax: 8_000,
  /** Candidate rows loaded per call. Equals the per-business memory cap, so normally every usable memory is considered. */
  candidateLimit: MEMORY_LIMITS.maxMemoriesPerBusiness,
} as const;

export const RETRIEVAL_SCORING = { labelTermWeight: 3, contentTermWeight: 1, phraseBonus: 2 } as const;

export const RETRIEVAL_STRATEGIES = ["LEXICAL_V1", "RECENCY"] as const;
export type RetrievalStrategy = (typeof RETRIEVAL_STRATEGIES)[number];

export const memoryRetrievalInputSchema = z
  .object({
    /** MUST come from the authorized WorkspaceUser, never from a client. Verified against the business below. */
    workspaceId: z.string().min(1).max(64),
    businessId: z.string().min(1).max(64),
    /** Task description / search text. Rejected (not truncated) above 500 characters. Empty is allowed (see RECENCY). */
    query: z.string().max(MEMORY_RETRIEVAL_LIMITS.queryMaxLength).default(""),
    types: z.array(z.enum(BUSINESS_MEMORY_TYPES)).min(1).max(BUSINESS_MEMORY_TYPES.length).optional(),
    maxResults: z.number().int().min(1).max(MEMORY_RETRIEVAL_LIMITS.maxResultsMax).default(MEMORY_RETRIEVAL_LIMITS.maxResultsDefault),
    maxContentChars: z.number().int().min(MEMORY_RETRIEVAL_LIMITS.maxContentCharsMin).max(MEMORY_RETRIEVAL_LIMITS.maxContentCharsMax).default(MEMORY_RETRIEVAL_LIMITS.maxContentCharsDefault),
  })
  .strict();
export type MemoryRetrievalInput = z.input<typeof memoryRetrievalInputSchema>;
export type ParsedMemoryRetrievalInput = z.output<typeof memoryRetrievalInputSchema>;

export interface MemoryRelevance {
  reason: "LEXICAL_MATCH" | "RECENCY_ONLY";
  score: number;
  matchedTermCount: number;
  labelTermMatches: number;
  contentTermMatches: number;
  phraseMatch: boolean;
}

/** A usable memory as returned to callers. Not a database row. */
export interface RetrievedMemory {
  id: string;
  type: BusinessMemoryTypeValue;
  label: string | null;
  content: string;
  /** Retrieval only ever returns ACTIVE, non-expired memories. */
  status: "ACTIVE";
  expiresAt: Date | null;
  relevance: MemoryRelevance;
}

export interface MemoryRetrievalResult {
  businessId: string;
  strategy: RetrievalStrategy;
  /** Retrieved text is untrusted business data, never platform instructions. */
  contentTrust: "UNTRUSTED_BUSINESS_DATA";
  queryTermCount: number;
  items: RetrievedMemory[];
  /** Matches before the result/content limits were applied (all usable memories under RECENCY). */
  totalMatched: number;
  totalSelected: number;
  /** label + content characters of the selected items. */
  contentCharsUsed: number;
  maxResults: number;
  maxContentChars: number;
  /** More matches existed than maxResults allowed. */
  resultLimitReached: boolean;
  /** At least one match was skipped because it did not fit the remaining content budget. */
  contentBudgetReached: boolean;
  candidatesConsidered: number;
  /** The candidate load hit its cap (only possible if the per-business cap was exceeded by a race). */
  candidateLimitReached: boolean;
  noMatches: boolean;
}

export interface RetrievalCandidate {
  id: string;
  type: BusinessMemoryTypeValue;
  label: string | null;
  content: string;
  expiresAt: Date | null;
  createdAt: Date;
}

const STOPWORDS: ReadonlySet<string> = new Set([
  "a", "an", "the", "and", "or", "but", "if", "of", "to", "in", "on", "at", "by", "for", "with", "from", "as", "is", "are", "was", "were", "be", "been",
  "it", "its", "this", "that", "these", "those", "we", "our", "us", "you", "your", "i", "my", "me", "he", "she", "they", "them", "their", "do", "does",
  "did", "not", "no", "so", "than", "then", "too", "very", "can", "will", "just", "about", "into", "over", "also", "how", "what", "when", "where", "who", "which", "why",
]);

export function normalizeText(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, " ").trim();
}

function tokenize(text: string): string[] {
  const normalized = normalizeText(text);
  if (normalized === "") return [];
  return normalized.split(" ").filter((t) => t.length >= MEMORY_RETRIEVAL_LIMITS.termMinLength && !STOPWORDS.has(t));
}

/** Distinct usable query terms in first-seen order, capped. */
export function extractQueryTerms(query: string): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const t of tokenize(query)) {
    if (seen.has(t)) continue;
    seen.add(t);
    terms.push(t);
    if (terms.length >= MEMORY_RETRIEVAL_LIMITS.maxQueryTerms) break;
  }
  return terms;
}

function containsWordSequence(normalizedHaystack: string, normalizedNeedle: string): boolean {
  if (normalizedNeedle === "" || normalizedHaystack === "") return false;
  return ` ${normalizedHaystack} `.includes(` ${normalizedNeedle} `);
}

export function scoreMemory(terms: readonly string[], normalizedQuery: string, memory: { label: string | null; content: string }): MemoryRelevance {
  const labelTokens = new Set(tokenize(memory.label ?? ""));
  const contentTokens = new Set(tokenize(memory.content));
  let labelTermMatches = 0;
  let contentTermMatches = 0;
  let matchedTermCount = 0;
  for (const t of terms) {
    const inLabel = labelTokens.has(t);
    const inContent = contentTokens.has(t);
    if (inLabel) labelTermMatches++;
    if (inContent) contentTermMatches++;
    if (inLabel || inContent) matchedTermCount++;
  }
  const phraseMatch =
    matchedTermCount > 0 && terms.length >= 2 &&
    (containsWordSequence(normalizeText(memory.content), normalizedQuery) || containsWordSequence(normalizeText(memory.label ?? ""), normalizedQuery));
  const score = RETRIEVAL_SCORING.labelTermWeight * labelTermMatches + RETRIEVAL_SCORING.contentTermWeight * contentTermMatches + (phraseMatch ? RETRIEVAL_SCORING.phraseBonus : 0);
  return { reason: "LEXICAL_MATCH", score, matchedTermCount, labelTermMatches, contentTermMatches, phraseMatch };
}

const RECENCY_RELEVANCE: MemoryRelevance = { reason: "RECENCY_ONLY", score: 0, matchedTermCount: 0, labelTermMatches: 0, contentTermMatches: 0, phraseMatch: false };

interface Ranked { candidate: RetrievalCandidate; relevance: MemoryRelevance }

function compareRanked(a: Ranked, b: Ranked): number {
  if (a.relevance.score !== b.relevance.score) return b.relevance.score - a.relevance.score;
  const at = a.candidate.createdAt.getTime();
  const bt = b.candidate.createdAt.getTime();
  if (at !== bt) return bt - at;
  return a.candidate.id < b.candidate.id ? -1 : a.candidate.id > b.candidate.id ? 1 : 0;
}

export interface RetrievalSelection {
  strategy: RetrievalStrategy;
  queryTermCount: number;
  items: RetrievedMemory[];
  totalMatched: number;
  contentCharsUsed: number;
  resultLimitReached: boolean;
  contentBudgetReached: boolean;
}

/** Pure ranking + selection over ALREADY business-scoped, ACTIVE, non-expired candidates. */
export function selectMemories(candidates: readonly RetrievalCandidate[], query: string, limits: { maxResults: number; maxContentChars: number }): RetrievalSelection {
  const terms = extractQueryTerms(query);
  const strategy: RetrievalStrategy = terms.length > 0 ? "LEXICAL_V1" : "RECENCY";
  const normalizedQuery = normalizeText(query);

  const ranked: Ranked[] = [];
  for (const candidate of candidates) {
    if (strategy === "RECENCY") { ranked.push({ candidate, relevance: RECENCY_RELEVANCE }); continue; }
    const relevance = scoreMemory(terms, normalizedQuery, candidate);
    if (relevance.matchedTermCount > 0) ranked.push({ candidate, relevance });
  }
  ranked.sort(compareRanked);

  const items: RetrievedMemory[] = [];
  let contentCharsUsed = 0;
  let resultLimitReached = false;
  let contentBudgetReached = false;
  for (const { candidate, relevance } of ranked) {
    if (items.length >= limits.maxResults) { resultLimitReached = true; break; }
    const cost = (candidate.label?.length ?? 0) + candidate.content.length;
    if (contentCharsUsed + cost > limits.maxContentChars) { contentBudgetReached = true; continue; }
    contentCharsUsed += cost;
    items.push({ id: candidate.id, type: candidate.type, label: candidate.label, content: candidate.content, status: "ACTIVE", expiresAt: candidate.expiresAt, relevance });
  }
  return { strategy, queryTermCount: terms.length, items, totalMatched: ranked.length, contentCharsUsed, resultLimitReached, contentBudgetReached };
}
