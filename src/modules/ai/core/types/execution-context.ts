import type { BusinessContext } from "@/types/business-context";
import type { EffectiveBusinessAIPreferences } from "@/modules/ai/preferences/types";
import type { RetrievedMemory } from "@/modules/ai/memory/retrieval";

/**
 * Module 5B.4. How business memory was resolved for this request.
 *  - INJECTABLE        retrieval returned >=1 memory (items non-empty)
 *  - NO_MATCH          retrieval ran and nothing matched
 *  - SKIPPED_NO_TERMS  the request had no meaningful lexical terms; retrieval was NOT called
 *  - DEGRADED          retrieval failed for a non-authorization (infrastructure) reason; continuing without memory
 */
export type MemoryResolutionStatus = "INJECTABLE" | "NO_MATCH" | "SKIPPED_NO_TERMS" | "DEGRADED";
export interface ResolvedBusinessMemory { status: MemoryResolutionStatus; items: RetrievedMemory[] }

export interface CoreExecutionContext {
  workspaceId: string; businessId: string | null; businessContext: BusinessContext | null;
  /** Module 5B.1. null whenever no business context was requested. */
  businessPreferences: EffectiveBusinessAIPreferences | null;
  /** Module 5B.4. null whenever no business context was requested (retrieval is never attempted then). */
  businessMemory: ResolvedBusinessMemory | null;
  actorUserId: string;
}
