import "server-only";
import { listModels, resolveModelAvailability } from "../models/model.registry";
import { getProvider } from "../providers/provider.registry";
import { missingCapabilities } from "../types/capability";
import { rankCandidates } from "./strategies";
import { AICoreError } from "../types/errors";
import type { ModelDefinition } from "../types/model";
import type { AITaskRequirements, RouterResult, RejectedCandidate, SelectionReasonCode } from "../types/routing";
import type { AICapability } from "../types/capability";

function resolveEffectiveRequiredCapabilities(requirements: AITaskRequirements): AICapability[] {
  const required = new Set<AICapability>(requirements.requiredCapabilities);
  if (requirements.streamingRequired) required.add("STREAMING");
  if (requirements.structuredOutputRequired) required.add("STRUCTURED_OUTPUT");
  if (requirements.visionRequired) required.add("VISION");
  if (requirements.toolCallingRequired) required.add("TOOL_CALLING");
  return Array.from(required);
}
const STRATEGY_SELECTION_REASON: Record<AITaskRequirements["strategy"], SelectionReasonCode> = { QUALITY: "BEST_QUALITY_MATCH", BALANCED: "BEST_BALANCED_MATCH", FAST: "FASTEST_AVAILABLE", COST_EFFICIENT: "CHEAPEST_AVAILABLE" };

export function routeRequest(requirements: AITaskRequirements, excludeCombos?: ReadonlySet<string>): RouterResult {
  const requiredCapabilities = resolveEffectiveRequiredCapabilities(requirements);
  const rejected: RejectedCandidate[] = [];
  const candidates: ModelDefinition[] = [];
  for (const model of listModels()) {
    if (excludeCombos?.has(`${model.provider}:${model.modelId}`)) continue;
    if (model.lifecycle === "DEPRECATED") { rejected.push({ provider: model.provider, modelId: model.modelId, reason: "MODEL_DEPRECATED" }); continue; }
    if (model.metadataVerification !== "VERIFIED_AGAINST_DOCS") { rejected.push({ provider: model.provider, modelId: model.modelId, reason: "MODEL_METADATA_UNVERIFIED" }); continue; }
    const missing = missingCapabilities(model.capabilities, requiredCapabilities);
    if (missing.length > 0) { rejected.push({ provider: model.provider, modelId: model.modelId, reason: "MISSING_CAPABILITY", missingCapabilities: missing }); continue; }
    if (requirements.minContextTokens && model.contextWindowTokens < requirements.minContextTokens) { rejected.push({ provider: model.provider, modelId: model.modelId, reason: "INSUFFICIENT_CONTEXT_WINDOW" }); continue; }
    const provider = getProvider(model.provider);
    if (!provider || !provider.isConfigured()) { rejected.push({ provider: model.provider, modelId: model.modelId, reason: "PROVIDER_NOT_CONFIGURED" }); continue; }
    const availability = resolveModelAvailability(model);
    if (availability === "UNAVAILABLE") { rejected.push({ provider: model.provider, modelId: model.modelId, reason: "PROVIDER_UNAVAILABLE" }); continue; }
    if (availability !== "AVAILABLE") { rejected.push({ provider: model.provider, modelId: model.modelId, reason: "MODEL_UNAVAILABLE" }); continue; }
    candidates.push(model);
  }
  if (candidates.length === 0) {
    const isFallbackExhaustion = Boolean(excludeCombos && excludeCombos.size > 0);
    throw new AICoreError(
      isFallbackExhaustion ? "ALL_CANDIDATES_EXHAUSTED" : "NO_COMPATIBLE_MODEL",
      isFallbackExhaustion ? "All compatible provider/model candidates have already been attempted for this request." : "No configured, available model satisfies the required capabilities/context window.",
      { fromProvider: false }
    );
  }
  if (requirements.preferredModelId) {
    const exact = candidates.find((m) => m.modelId === requirements.preferredModelId && (!requirements.preferredProvider || m.provider === requirements.preferredProvider));
    if (exact) return { selectedProvider: exact.provider, selectedModelId: exact.modelId, strategy: requirements.strategy, candidateCount: candidates.length, rejectedCandidates: rejected, selectionReason: "PREFERRED_MODEL_HONORED" };
  }
  const ranked = rankCandidates(candidates, requirements.strategy, requirements.preferredCapabilities);
  if (requirements.preferredProvider) {
    const preferredSubset = ranked.filter((m) => m.provider === requirements.preferredProvider);
    if (preferredSubset.length > 0) {
      const selected = preferredSubset[0]!;
      return { selectedProvider: selected.provider, selectedModelId: selected.modelId, strategy: requirements.strategy, candidateCount: candidates.length, rejectedCandidates: rejected, selectionReason: "PREFERRED_PROVIDER_HONORED" };
    }
  }
  const top = ranked[0]!;
  return { selectedProvider: top.provider, selectedModelId: top.modelId, strategy: requirements.strategy, candidateCount: candidates.length, rejectedCandidates: rejected, selectionReason: candidates.length === 1 ? "ONLY_CANDIDATE_AVAILABLE" : STRATEGY_SELECTION_REASON[requirements.strategy] };
}
