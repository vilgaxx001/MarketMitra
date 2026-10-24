import "server-only";
import { resolveBusinessContext } from "@/modules/context/service";
import { requireBusinessAccess } from "@/lib/middleware/require-business";
import { resolveEffectiveAIPreferences } from "@/modules/ai/preferences/service";
import { ApiException } from "@/lib/api-response";
import { logger } from "@/lib/logger";
import { retrieveBusinessMemories } from "@/modules/ai/memory/retrieval.service";
import { buildMemoryRetrievalQuery, MEMORY_CONTEXT_LIMITS } from "@/modules/ai/memory/context";
import { AICoreError } from "../types/errors";
import type { WorkspaceUser } from "@/modules/auth/types";
import type { AICoreRequest } from "../types/core-request";
import type { CoreExecutionContext, ResolvedBusinessMemory } from "../types/execution-context";
/**
 * The request's workspaceId must equal the AUTHORIZED workspace. It is
 * never trusted on its own: it keys the rate limiter, traces and (via the
 * execution context) everything downstream. Mismatch is rejected before
 * any business-context or preference access. The message deliberately
 * omits both IDs.
 */
export function assertRequestWorkspaceMatches(request: AICoreRequest, workspaceUser: WorkspaceUser): void {
  if (request.workspaceId !== workspaceUser.workspaceId) {
    // Security signal. Only AUTHORIZED identifiers are logged; the request's own workspace id is attacker-controlled and is never echoed.
    logger.warn({ msg: "ai_request_workspace_mismatch", workspaceId: workspaceUser.workspaceId, actorUserId: workspaceUser.id });
    throw new AICoreError("INVALID_REQUEST", "The request workspace does not match the authorized workspace.", { fromProvider: false });
  }
}
export async function resolveExecutionContext(request: AICoreRequest, workspaceUser: WorkspaceUser): Promise<CoreExecutionContext> {
  assertRequestWorkspaceMatches(request, workspaceUser);
  if (!request.requiresBusinessContext) return { workspaceId: request.workspaceId, businessId: null, businessContext: null, businessPreferences: null, businessMemory: null, actorUserId: request.actorUserId };
  if (!request.businessId) throw new AICoreError("INVALID_REQUEST", "requiresBusinessContext is true but no businessId was provided.", { fromProvider: false });
  await requireBusinessAccess(workspaceUser, request.businessId);
  const businessContext = await resolveBusinessContext(workspaceUser, request.businessId);
  const businessPreferences = await resolveEffectiveAIPreferences(workspaceUser, request.businessId, businessContext);
  const businessMemory = await resolveBusinessMemory(request, workspaceUser, request.businessId);
  return { workspaceId: request.workspaceId, businessId: request.businessId, businessContext, businessPreferences, businessMemory, actorUserId: request.actorUserId };
}

/**
 * Module 5B.4 — memory for an ALREADY AUTHORIZED business (called only after the workspace-match
 * guard, requireBusinessAccess and preference resolution succeeded).
 *
 * Authorization/tenant IDs: the workspace comes from the authorized WorkspaceUser, the business is the
 * one requireBusinessAccess just verified. retrieveBusinessMemories re-verifies the pair itself (kept on
 * purpose: it is the retrieval contract, cheap, and removing it would let a future caller skip the check).
 *
 * Failure policy (explicit):
 *  - ApiException / AICoreError (authorization, not-found, validation): FAIL CLOSED — rethrown, no provider
 *    call, never turned into "no memory" or another tenant.
 *  - Any other error (database/network/infrastructure): DEGRADE to no memory. Memory is lexical,
 *    best-effort context, so its absence is a quality loss, not a security or tenant event. Logged as a
 *    warning with the error class name and a Prisma-style code only (never the message, which can echo values).
 *    Note: degradation can drop a stored BUSINESS_CONSTRAINT memory for that request; preferences (hard
 *    configuration) remain fail-closed.
 */
async function resolveBusinessMemory(request: AICoreRequest, workspaceUser: WorkspaceUser, businessId: string): Promise<ResolvedBusinessMemory> {
  const built = buildMemoryRetrievalQuery(request.messages);
  // No meaningful lexical terms: skip by default. RECENCY (arbitrary newest memories) is never used from AI Core.
  if (!built || built.usableTermCount === 0) return { status: "SKIPPED_NO_TERMS", items: [] };
  try {
    const result = await retrieveBusinessMemories({
      workspaceId: workspaceUser.workspaceId,
      businessId,
      query: built.query,
      maxResults: MEMORY_CONTEXT_LIMITS.maxResults,
      maxContentChars: MEMORY_CONTEXT_LIMITS.maxContentChars,
    });
    return { status: result.items.length > 0 ? "INJECTABLE" : "NO_MATCH", items: result.items };
  } catch (err) {
    if (err instanceof ApiException || err instanceof AICoreError) throw err;
    const code = (err as { code?: unknown } | null)?.code;
    logger.warn({
      msg: "ai.memory_retrieval_degraded", businessId,
      errorName: err instanceof Error ? err.name : "NonError",
      errorCode: typeof code === "string" && /^P\d{4}$/.test(code) ? code : undefined,
    });
    return { status: "DEGRADED", items: [] };
  }
}
