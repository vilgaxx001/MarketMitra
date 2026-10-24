/**
 * src/modules/ai/memory/index.ts — public API of Business Memory (5B.2 CRUD, 5B.3 retrieval).
 *
 * `retrieveBusinessMemories` (5B.3) is the ONLY intended read path for AI use.
 * It is a standalone service: nothing in AI Core imports this module today.
 * 5B.4 may call it from `resolveExecutionContext()` after the workspace-match
 * guard and `requireBusinessAccess()`; see docs/AI_MEMORY.md for the contract.
 */
export {
  createBusinessMemory, listBusinessMemories, getBusinessMemory, updateBusinessMemory,
  archiveBusinessMemory, restoreBusinessMemory, deleteBusinessMemory,
} from "./service";
export { retrieveBusinessMemories } from "./retrieval.service";
export { MEMORY_RETRIEVAL_LIMITS, RETRIEVAL_SCORING, RETRIEVAL_STRATEGIES, memoryRetrievalInputSchema } from "./retrieval";
export type { MemoryRetrievalInput, MemoryRetrievalResult, RetrievedMemory, MemoryRelevance, RetrievalStrategy } from "./retrieval";
export {
  createBusinessMemorySchema, updateBusinessMemorySchema, listBusinessMemoriesQuerySchema, memoryIdSchema,
} from "./validators";
export * from "./types";
