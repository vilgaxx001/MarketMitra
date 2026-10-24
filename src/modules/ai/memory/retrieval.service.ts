/**
 * src/modules/ai/memory/retrieval.service.ts
 *
 * Authorized, business-scoped memory retrieval (Module 5B.3). Read-only.
 * Not wired into AI Core: 5B.4 owns calling this from
 * resolveExecutionContext() and rendering results into a request.
 *
 * Authorization: `businessId` is never proof of anything. The business must
 * belong to `workspaceId` (verified with the same authoritative lookup the
 * CRUD service uses) before any memory row is read, and `workspaceId` must
 * be the AUTHORIZED workspace of the calling WorkspaceUser. A business in
 * another workspace is indistinguishable from a missing one (NOT_FOUND).
 *
 * Logging: counts and strategy only. The query text, memory text and labels
 * are never logged.
 */
import { ApiException } from "@/lib/api-response";
import { logger } from "@/lib/logger";
import * as businessRepo from "@/modules/business/repository";
import * as retrievalRepo from "./retrieval.repository";
import { MEMORY_RETRIEVAL_LIMITS, memoryRetrievalInputSchema, selectMemories } from "./retrieval";
import type { MemoryRetrievalInput, MemoryRetrievalResult, RetrievalCandidate } from "./retrieval";

export async function retrieveBusinessMemories(input: MemoryRetrievalInput, options: { now?: Date } = {}): Promise<MemoryRetrievalResult> {
  const parsed = memoryRetrievalInputSchema.safeParse(input);
  // Generic message: never echo the (possibly sensitive) query back.
  if (!parsed.success) throw new ApiException("VALIDATION_ERROR", "Invalid memory retrieval request.");
  const { workspaceId, businessId, query, maxResults, maxContentChars } = parsed.data;
  const types = parsed.data.types ? Array.from(new Set(parsed.data.types)) : undefined;

  const business = await businessRepo.findByIdInWorkspace(businessId, workspaceId);
  if (!business) throw new ApiException("NOT_FOUND", "Business not found.");

  const now = options.now ?? new Date();
  const rows = await retrievalRepo.findRetrievalCandidates(businessId, { types, now, limit: MEMORY_RETRIEVAL_LIMITS.candidateLimit });
  const candidates: RetrievalCandidate[] = rows.map((r) => ({
    id: r.id, type: r.type, label: r.label, content: r.content, expiresAt: r.expiresAt, createdAt: r.createdAt,
  }));
  const selection = selectMemories(candidates, query, { maxResults, maxContentChars });

  const result: MemoryRetrievalResult = {
    businessId,
    strategy: selection.strategy,
    contentTrust: "UNTRUSTED_BUSINESS_DATA",
    queryTermCount: selection.queryTermCount,
    items: selection.items,
    totalMatched: selection.totalMatched,
    totalSelected: selection.items.length,
    contentCharsUsed: selection.contentCharsUsed,
    maxResults,
    maxContentChars,
    resultLimitReached: selection.resultLimitReached,
    contentBudgetReached: selection.contentBudgetReached,
    candidatesConsidered: candidates.length,
    candidateLimitReached: candidates.length >= MEMORY_RETRIEVAL_LIMITS.candidateLimit,
    noMatches: selection.totalMatched === 0,
  };
  logger.debug({
    msg: "memory.retrieval", businessId, strategy: result.strategy, queryTermCount: result.queryTermCount, candidatesConsidered: result.candidatesConsidered,
    totalMatched: result.totalMatched, totalSelected: result.totalSelected, contentCharsUsed: result.contentCharsUsed,
    resultLimitReached: result.resultLimitReached, contentBudgetReached: result.contentBudgetReached,
  });
  return result;
}
