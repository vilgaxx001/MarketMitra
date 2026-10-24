import type { NormalizedMessage } from "./message";
import type { NormalizedFinishReason } from "./finish-reason";
import type { StreamEvent } from "./streaming";
export const AI_PROVIDER_IDS = ["openai", "anthropic", "gemini", "grok", "deepseek"] as const;
export type AIProviderId = (typeof AI_PROVIDER_IDS)[number];
export interface GenerationConfig { maxOutputTokens?: number; temperature?: number; stopSequences?: string[]; structuredOutput?: { enabled: true; schemaName?: string }; }
export interface ProviderGenerationRequest { modelId: string; messages: NormalizedMessage[]; systemInstruction?: string; config: GenerationConfig; }
export type UsageReportKind = "PROVIDER_REPORTED" | "ESTIMATED" | "UNAVAILABLE";
export interface UsageInfo { kind: UsageReportKind; inputTokens?: number; outputTokens?: number; totalTokens?: number; }
export interface ProviderGenerationResponse { content: string; finishReason: NormalizedFinishReason; rawFinishReason: string | null; usage: UsageInfo; providerRequestId?: string; latencyMs: number; }
export interface ProviderStreamRequest extends ProviderGenerationRequest { stream: true; }
export interface AIProvider {
  readonly id: AIProviderId; readonly displayName: string; isConfigured(): boolean;
  generate(request: ProviderGenerationRequest): Promise<ProviderGenerationResponse>;
  generateStream?(request: ProviderStreamRequest): AsyncGenerator<StreamEvent, void, unknown>;
}
