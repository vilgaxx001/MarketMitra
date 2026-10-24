import type { AICapability } from "./capability";
import type { AIProviderId } from "./provider";
export type RoutingStrategy = "QUALITY" | "BALANCED" | "FAST" | "COST_EFFICIENT";
export interface AITaskRequirements {
  requiredCapabilities: AICapability[]; preferredCapabilities?: AICapability[]; minContextTokens?: number;
  streamingRequired?: boolean; structuredOutputRequired?: boolean; visionRequired?: boolean; toolCallingRequired?: boolean;
  strategy: RoutingStrategy; preferredProvider?: AIProviderId; preferredModelId?: string;
}
export type CandidateRejectionReason = "MISSING_CAPABILITY"|"INSUFFICIENT_CONTEXT_WINDOW"|"PROVIDER_NOT_CONFIGURED"|"PROVIDER_UNAVAILABLE"|"MODEL_UNAVAILABLE"|"MODEL_DEPRECATED"|"MODEL_METADATA_UNVERIFIED";
export interface RejectedCandidate { provider: AIProviderId; modelId: string; reason: CandidateRejectionReason; missingCapabilities?: AICapability[]; }
export type SelectionReasonCode = "BEST_QUALITY_MATCH"|"BEST_BALANCED_MATCH"|"FASTEST_AVAILABLE"|"CHEAPEST_AVAILABLE"|"PREFERRED_MODEL_HONORED"|"PREFERRED_PROVIDER_HONORED"|"ONLY_CANDIDATE_AVAILABLE";
export interface RouterResult { selectedProvider: AIProviderId; selectedModelId: string; strategy: RoutingStrategy; candidateCount: number; rejectedCandidates: RejectedCandidate[]; selectionReason: SelectionReasonCode; }
