import "server-only";
/**
 * src/modules/ai/core/models/model.registry.ts
 *
 * The one place model IDs are hardcoded. MAINTENANCE: edit
 * MODEL_DEFINITIONS. `capabilities` must match reality — the router
 * trusts this table completely. costTier/speedTier are qualitative (5E
 * owns real pricing). Retire models via lifecycle: "DEPRECATED"; don't
 * delete rows.
 *
 * PRODUCTION ROUTING POLICY
 * A model is routable only when ALL hold: lifecycle is not DEPRECATED,
 * metadataVerification is VERIFIED_AGAINST_DOCS, its provider adapter is
 * configured, and provider health is not UNAVAILABLE. A configured API
 * key never overrides verification. Unverified rows stay inspectable via
 * listModels() / listUnverifiedModels() for registry maintenance, and
 * resolveModelAvailability() reports them as "UNVERIFIED" (distinct from
 * "DEPRECATED", which is a verified lifecycle fact).
 *
 * VERIFICATION RESULTS (2026-10-10, official provider docs only)
 *  - gpt-4o, gpt-4o-mini: VERIFIED. ID, 128k context, 16,384 max output,
 *    image input, streaming, Chat Completions endpoint, structured
 *    outputs; JSON mode covered by "gpt-4o-*" in the structured-outputs
 *    guide. No deprecation of the aliases on the deprecations page.
 *  - claude-3-5-sonnet-20241022: DEPRECATED — retired 2025-10-28.
 *  - claude-3-5-haiku-20241022: DEPRECATED — retired 2026-02-19.
 *  - gemini-1.5-pro, gemini-1.5-flash: DEPRECATED — shut down
 *    2025-09-29 (Gemini API changelog).
 *  Remaining metadata of the retired rows (limits, capabilities) was not
 *  re-verified because the models cannot be served; they are excluded
 *  regardless.
 *  NOTE: Anthropic's docs name replacements (claude-haiku-4-5-20251001,
 *  claude-sonnet-5-5) but they are NOT registered here: their limits and
 *  capabilities, and compatibility with the installed @anthropic-ai/sdk
 *  0.32.1, are unverified. Adding them is a separate, verified change.
 *
 * TOOL_CALLING is deliberately NOT declared on any model (no normalized
 * tool contract in the adapters; Module 5D). EMBEDDINGS is deliberately
 * NOT declared (chat/completion models only).
 *
 * STRUCTURED_OUTPUT here means JSON mode only (OpenAI
 * response_format {type:"json_object"}, Gemini responseMimeType
 * application/json) — NOT schema-validated structured output. Anthropic
 * declares none. Schema-constrained output is deferred to 5D.
 */
import { getProvider } from "../providers/provider.registry";
import { getProviderHealth } from "../policy/health.tracker";
import type { ModelDefinition, ModelAvailabilityState } from "../types/model";

const OPENAI_SOURCES = [
  "https://developers.openai.com/api/docs/models/gpt-4o",
  "https://developers.openai.com/api/docs/models/gpt-4o-mini",
  "https://developers.openai.com/api/docs/guides/structured-outputs",
  "https://developers.openai.com/api/docs/deprecations",
] as const;

const MODEL_DEFINITIONS: ModelDefinition[] = [
  { provider: "openai", modelId: "gpt-4o", displayName: "GPT-4o", capabilities: ["TEXT_GENERATION","STREAMING","STRUCTURED_OUTPUT","VISION","LONG_CONTEXT"], contextWindowTokens: 128_000, maxOutputTokens: 16_384, speedTier: "MEDIUM", costTier: "MEDIUM", lifecycle: "REGISTERED", metadataVerification: "VERIFIED_AGAINST_DOCS", verification: { verifiedOn: "2026-10-10", sources: OPENAI_SOURCES, notes: "SDK openai@4.78.1 chat.completions used by the adapter; endpoint v1/chat/completions listed as supported." } },
  { provider: "openai", modelId: "gpt-4o-mini", displayName: "GPT-4o mini", capabilities: ["TEXT_GENERATION","STREAMING","STRUCTURED_OUTPUT","VISION","LONG_CONTEXT"], contextWindowTokens: 128_000, maxOutputTokens: 16_384, speedTier: "FAST", costTier: "LOW", lifecycle: "REGISTERED", metadataVerification: "VERIFIED_AGAINST_DOCS", verification: { verifiedOn: "2026-10-10", sources: OPENAI_SOURCES, notes: "SDK openai@4.78.1 chat.completions used by the adapter; endpoint v1/chat/completions listed as supported." } },
  { provider: "anthropic", modelId: "claude-3-5-sonnet-20241022", displayName: "Claude 3.5 Sonnet (retired)", capabilities: ["TEXT_GENERATION","STREAMING","VISION","LONG_CONTEXT"], contextWindowTokens: 200_000, maxOutputTokens: 8_192, speedTier: "MEDIUM", costTier: "MEDIUM", lifecycle: "DEPRECATED", metadataVerification: "UNVERIFIED_TRAINING_DATA", verification: { verifiedOn: "2026-10-10", sources: ["https://platform.claude.com/docs/en/about-claude/model-deprecations"], notes: "Retired 2025-10-28 per Anthropic. Only the lifecycle was verified." } },
  { provider: "anthropic", modelId: "claude-3-5-haiku-20241022", displayName: "Claude 3.5 Haiku (retired)", capabilities: ["TEXT_GENERATION","STREAMING","LONG_CONTEXT"], contextWindowTokens: 200_000, maxOutputTokens: 8_192, speedTier: "FAST", costTier: "LOW", lifecycle: "DEPRECATED", metadataVerification: "UNVERIFIED_TRAINING_DATA", verification: { verifiedOn: "2026-10-10", sources: ["https://platform.claude.com/docs/en/about-claude/model-deprecations"], notes: "Retired 2026-02-19 per Anthropic. Only the lifecycle was verified." } },
  { provider: "gemini", modelId: "gemini-1.5-pro", displayName: "Gemini 1.5 Pro (shut down)", capabilities: ["TEXT_GENERATION","STREAMING","STRUCTURED_OUTPUT","VISION","LONG_CONTEXT"], contextWindowTokens: 2_000_000, maxOutputTokens: 8_192, speedTier: "MEDIUM", costTier: "MEDIUM", lifecycle: "DEPRECATED", metadataVerification: "UNVERIFIED_TRAINING_DATA", verification: { verifiedOn: "2026-10-10", sources: ["https://ai.google.dev/gemini-api/docs/changelog"], notes: "Shut down 2025-09-29 per Google. Only the lifecycle was verified." } },
  { provider: "gemini", modelId: "gemini-1.5-flash", displayName: "Gemini 1.5 Flash (shut down)", capabilities: ["TEXT_GENERATION","STREAMING","STRUCTURED_OUTPUT","VISION","LONG_CONTEXT"], contextWindowTokens: 1_000_000, maxOutputTokens: 8_192, speedTier: "FAST", costTier: "LOW", lifecycle: "DEPRECATED", metadataVerification: "UNVERIFIED_TRAINING_DATA", verification: { verifiedOn: "2026-10-10", sources: ["https://ai.google.dev/gemini-api/docs/changelog"], notes: "Shut down 2025-09-29 per Google. Only the lifecycle was verified." } },
];

/**
 * TEST-ONLY catalog override (mirrors the provider registry's test
 * overrides). Production code never calls this.
 */
let testCatalogOverride: ModelDefinition[] | null = null;
export function __setTestModelCatalog(models: ModelDefinition[]): void { testCatalogOverride = models; }
export function __clearTestModelCatalog(): void { testCatalogOverride = null; }

function catalog(): ModelDefinition[] { return testCatalogOverride ?? MODEL_DEFINITIONS; }

/** All rows, including unverified/deprecated — for registry maintenance, NOT for routing. */
export function listModels(): ModelDefinition[] { return catalog(); }
/** Rows whose metadata is not verified against official docs (maintenance view). */
export function listUnverifiedModels(): ModelDefinition[] { return catalog().filter((m) => m.metadataVerification !== "VERIFIED_AGAINST_DOCS"); }
export function getModel(provider: string, modelId: string): ModelDefinition | undefined {
  return catalog().find((m) => m.provider === provider && m.modelId === modelId);
}
/**
 * Order matters: lifecycle, then verification, THEN provider
 * configuration — so a configured API key can never make an
 * unverified model routable.
 */
export function resolveModelAvailability(model: ModelDefinition): ModelAvailabilityState {
  if (model.lifecycle === "DEPRECATED") return "DEPRECATED";
  if (model.metadataVerification !== "VERIFIED_AGAINST_DOCS") return "UNVERIFIED";
  const provider = getProvider(model.provider);
  if (!provider || !provider.isConfigured()) return "UNAVAILABLE";
  const health = getProviderHealth(model.provider);
  if (health.status === "UNAVAILABLE") return "UNAVAILABLE";
  return "AVAILABLE";
}
export function listAvailableModels(): ModelDefinition[] { return catalog().filter((m) => resolveModelAvailability(m) === "AVAILABLE"); }
