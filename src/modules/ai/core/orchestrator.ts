import "server-only";
import { nanoid } from "nanoid";
import { validateMessages } from "./types/message";
import { routeRequest } from "./routing/router";
import { getProvider } from "./providers/provider.registry";
import { resolveExecutionContext, assertRequestWorkspaceMatches } from "./context/execution-context.service";
import { checkAIExecutionRateLimit } from "./rate-limit";
import { recordSuccess, recordFailure } from "./policy/health.tracker";
import { shouldRetry, computeBackoffMs } from "./policy/retry.policy";
import { isFallbackAllowed, hasReachedMaxAttempts, buildAttemptKey, MAX_PROVIDER_ATTEMPTS } from "./policy/fallback.policy";
import { buildProviderSystemInstruction } from "./context/system-instruction";
import { AICoreError } from "./types/errors";
import { logExecutionTrace } from "./types/trace";
import { logger } from "@/lib/logger";
import { ApiException } from "@/lib/api-response";
import { sleep } from "@/lib/utils";
import type { WorkspaceUser } from "@/modules/auth/types";
import type { AICoreRequest } from "./types/core-request";
import type { AICoreResponse } from "./types/core-response";
import type { ProviderAttempt } from "./types/trace";
import type { AIProviderId } from "./types/provider";

export async function executeAICoreRequest(request: AICoreRequest, workspaceUser: WorkspaceUser): Promise<AICoreResponse> {
  const traceId = nanoid(24);
  const startedAt = Date.now();
  const attempts: ProviderAttempt[] = [];
  const attemptedCombos = new Set<string>();
  let retryCount = 0;
  let fallbackCount = 0;
  // Only ever set from the AUTHORIZED execution context. The failure trace must not echo the
  // request's own (unverified, possibly foreign or attacker-chosen) business id.
  let authorizedBusinessId: string | null = null;
  try {
    // Before the rate limiter: a mismatched request must not consume another workspace's quota.
    assertRequestWorkspaceMatches(request, workspaceUser);
    const rateLimit = await checkAIExecutionRateLimit(request.workspaceId);
    if (!rateLimit.allowed) throw new AICoreError("RATE_LIMIT_EXCEEDED_INTERNAL", "AI execution rate limit exceeded for this workspace.", { fromProvider: false });
    const validationError = validateMessages(request.messages);
    if (validationError) throw new AICoreError("INVALID_REQUEST", validationError, { fromProvider: false });
    const executionContext = await resolveExecutionContext(request, workspaceUser);
    authorizedBusinessId = executionContext.businessId;
    // Preferences (5B.1) + business memory (5B.4): pure composition from the AUTHORIZED context — no DB access here.
    const { text: systemInstruction, preferencesTruncatedFields } = buildProviderSystemInstruction(request.messages, executionContext);
    // Legacy stored preference values above their documented limit are cut (documented in preferences/directive.ts). Field NAMES only.
    if (preferencesTruncatedFields.length > 0) logger.warn({ msg: "ai.preferences_truncated", workspaceId: workspaceUser.workspaceId, businessId: executionContext.businessId, fields: preferencesTruncatedFields });
    let routerResult = routeRequest(request.taskRequirements);
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const provider = getProvider(routerResult.selectedProvider);
      if (!provider) throw new AICoreError("PROVIDER_UNAVAILABLE", `Provider "${routerResult.selectedProvider}" is not registered.`, { provider: routerResult.selectedProvider, fromProvider: false });
      let attemptsForThisModel = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const attemptStartedAt = Date.now();
        try {
          const result = await provider.generate({
            modelId: routerResult.selectedModelId,
            messages: request.messages.filter((m) => m.role !== "SYSTEM"),
            systemInstruction,
            config: request.generationConfig,
          });
          attempts.push({ provider: routerResult.selectedProvider, modelId: routerResult.selectedModelId, attemptNumber: attempts.length + 1, succeeded: true, latencyMs: Date.now() - attemptStartedAt });
          recordSuccess(routerResult.selectedProvider);
          const totalLatencyMs = Date.now() - startedAt;
          logExecutionTrace({ traceId, workspaceId: request.workspaceId, businessId: executionContext.businessId, requestStartedAt: new Date(startedAt), strategy: routerResult.strategy, selectionReason: routerResult.selectionReason, selectedProvider: routerResult.selectedProvider, selectedModelId: routerResult.selectedModelId, attempts, retryCount, fallbackCount, terminalStatus: "SUCCESS", totalLatencyMs });
          return { traceId, status: "SUCCESS", content: result.content, provider: routerResult.selectedProvider, modelId: routerResult.selectedModelId, finishReason: result.finishReason, usage: result.usage, providerRequestId: result.providerRequestId, routing: { strategy: routerResult.strategy, selectionReason: routerResult.selectionReason, candidateCount: routerResult.candidateCount }, retryCount, fallbackCount, totalLatencyMs };
        } catch (err) {
          const normalized = err instanceof AICoreError ? err : new AICoreError("UNKNOWN_PROVIDER_ERROR", "Unhandled adapter error.", { provider: routerResult.selectedProvider, modelId: routerResult.selectedModelId, fromProvider: true });
          attempts.push({ provider: routerResult.selectedProvider, modelId: routerResult.selectedModelId, attemptNumber: attempts.length + 1, succeeded: false, errorCode: normalized.code, latencyMs: Date.now() - attemptStartedAt });
          recordFailure(routerResult.selectedProvider, normalized.code);
          attemptedCombos.add(buildAttemptKey(routerResult.selectedProvider, routerResult.selectedModelId));
          if (shouldRetry(normalized.code, attemptsForThisModel)) {
            attemptsForThisModel += 1; retryCount += 1;
            await sleep(computeBackoffMs(attemptsForThisModel - 1));
            continue;
          }
          if (!isFallbackAllowed(normalized.code)) throw normalized;
          if (hasReachedMaxAttempts(attemptedCombos)) throw new AICoreError("ALL_CANDIDATES_EXHAUSTED", `Exhausted the maximum of ${MAX_PROVIDER_ATTEMPTS} provider/model attempts for this request.`, { fromProvider: false });
          try {
            routerResult = routeRequest(request.taskRequirements, attemptedCombos);
          } catch (routingErr) {
            throw routingErr instanceof AICoreError ? routingErr : normalized;
          }
          fallbackCount += 1;
          break;
        }
      }
    }
  } catch (err) {
    const normalized = err instanceof AICoreError ? err : new AICoreError("UNKNOWN_PROVIDER_ERROR", "Unhandled orchestrator error.", { fromProvider: false });
    const totalLatencyMs = Date.now() - startedAt;
    logExecutionTrace({ traceId, workspaceId: workspaceUser.workspaceId, businessId: authorizedBusinessId, requestStartedAt: new Date(startedAt), strategy: request.taskRequirements.strategy, selectionReason: null, selectedProvider: (attempts[attempts.length - 1]?.provider as AIProviderId | undefined) ?? null, selectedModelId: attempts[attempts.length - 1]?.modelId ?? null, attempts, retryCount, fallbackCount, terminalStatus: "FAILED", totalLatencyMs });
    // Authorization / not-found failures from the business-access checks are API-level errors (404/403), not provider failures:
    // surface them unchanged so the caller is told the truth. Still fail-closed: nothing was sent to a provider.
    if (err instanceof ApiException) throw err;
    throw normalized;
  }
}
