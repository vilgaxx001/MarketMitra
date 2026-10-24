import type { ModelDefinition } from "@/modules/ai/core/types/model";

/**
 * SYNTHETIC test catalog. The production registry currently contains only
 * two routable models (both OpenAI), which is too small to exercise
 * cross-provider fallback and ranking. These rows are fixtures with
 * fixture IDs — they are NOT real provider models and make no claim
 * about any provider's offerings. Installed globally by
 * test/setup/model-catalog.ts; registry tests clear it to inspect the
 * real registry.
 */
const verified = { metadataVerification: "VERIFIED_AGAINST_DOCS" as const };
export const FIXTURE_MODEL_CATALOG: ModelDefinition[] = [
  { provider: "openai", modelId: "gpt-4o", displayName: "fixture gpt-4o", capabilities: ["TEXT_GENERATION","STREAMING","STRUCTURED_OUTPUT","VISION","LONG_CONTEXT"], contextWindowTokens: 128_000, maxOutputTokens: 16_384, speedTier: "MEDIUM", costTier: "MEDIUM", lifecycle: "REGISTERED", ...verified },
  { provider: "openai", modelId: "gpt-4o-mini", displayName: "fixture gpt-4o-mini", capabilities: ["TEXT_GENERATION","STREAMING","STRUCTURED_OUTPUT","VISION","LONG_CONTEXT"], contextWindowTokens: 128_000, maxOutputTokens: 16_384, speedTier: "FAST", costTier: "LOW", lifecycle: "REGISTERED", ...verified },
  { provider: "anthropic", modelId: "fixture-anthropic-medium", displayName: "fixture anthropic medium", capabilities: ["TEXT_GENERATION","STREAMING","VISION","LONG_CONTEXT"], contextWindowTokens: 200_000, maxOutputTokens: 8_192, speedTier: "MEDIUM", costTier: "MEDIUM", lifecycle: "REGISTERED", ...verified },
  { provider: "anthropic", modelId: "fixture-anthropic-fast", displayName: "fixture anthropic fast (no vision)", capabilities: ["TEXT_GENERATION","STREAMING","LONG_CONTEXT"], contextWindowTokens: 200_000, maxOutputTokens: 8_192, speedTier: "FAST", costTier: "LOW", lifecycle: "REGISTERED", ...verified },
  { provider: "gemini", modelId: "fixture-gemini-large", displayName: "fixture gemini large", capabilities: ["TEXT_GENERATION","STREAMING","STRUCTURED_OUTPUT","VISION","LONG_CONTEXT"], contextWindowTokens: 2_000_000, maxOutputTokens: 8_192, speedTier: "MEDIUM", costTier: "MEDIUM", lifecycle: "REGISTERED", ...verified },
  { provider: "gemini", modelId: "fixture-gemini-fast", displayName: "fixture gemini fast", capabilities: ["TEXT_GENERATION","STREAMING","STRUCTURED_OUTPUT","VISION","LONG_CONTEXT"], contextWindowTokens: 1_000_000, maxOutputTokens: 8_192, speedTier: "FAST", costTier: "LOW", lifecycle: "REGISTERED", ...verified },
];
