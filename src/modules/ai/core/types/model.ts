import type { AICapability, CapabilitySet } from "./capability";
import type { AIProviderId } from "./provider";

export type RelativeSpeedTier = "SLOW" | "MEDIUM" | "FAST";
export type RelativeCostTier = "LOW" | "MEDIUM" | "HIGH";
/**
 * UNVERIFIED = the row's metadata has not been checked against current
 * official provider documentation. It is NOT the same as DEPRECATED
 * (a verified lifecycle fact) and is never production-routable, even
 * when the provider API key is configured.
 */
export type ModelAvailabilityState = "REGISTERED" | "CONFIGURED" | "AVAILABLE" | "UNAVAILABLE" | "DEPRECATED" | "UNVERIFIED";

/**
 * Whether this row's metadata (ID, availability, limits, capabilities)
 * has been checked against current official provider documentation.
 * Only VERIFIED_AGAINST_DOCS rows are production-routable. See
 * model.registry.ts for the per-row evidence.
 */
export type ModelMetadataVerification = "UNVERIFIED_TRAINING_DATA" | "VERIFIED_AGAINST_DOCS";

export interface ModelDefinition {
  provider: AIProviderId;
  modelId: string;
  displayName: string;
  capabilities: CapabilitySet;
  contextWindowTokens: number;
  maxOutputTokens: number;
  speedTier: RelativeSpeedTier;
  costTier: RelativeCostTier;
  lifecycle: "REGISTERED" | "DEPRECATED";
  metadataVerification: ModelMetadataVerification;
  /** Evidence for this row; required in practice when VERIFIED_AGAINST_DOCS. */
  verification?: { verifiedOn: string; sources: readonly string[]; notes?: string };
}

export function supportsCapability(model: ModelDefinition, capability: AICapability): boolean {
  return model.capabilities.includes(capability);
}
