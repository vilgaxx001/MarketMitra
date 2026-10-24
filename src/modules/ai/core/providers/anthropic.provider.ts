import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { env, isAIProviderKeyConfigured } from "@/lib/env";
import { AICoreError } from "../types/errors";
import { normalizeAnthropicStopReason } from "../types/finish-reason";
import { resolveImageToBase64 } from "./image-resolver";
import type { AIProvider, ProviderGenerationRequest, ProviderGenerationResponse, ProviderStreamRequest } from "../types/provider";
import type { StreamEvent } from "../types/streaming";
import type { NormalizedMessage, MessagePart } from "../types/message";

type AnthropicContentBlock = Anthropic.TextBlockParam | Anthropic.ImageBlockParam;

async function toAnthropicContent(parts: MessagePart[]): Promise<string | AnthropicContentBlock[]> {
  const hasImage = parts.some((p) => p.type === "image");
  if (!hasImage) {
    return parts.filter((p): p is { type: "text"; text: string } => p.type === "text").map((p) => p.text).join("\n");
  }
  const blocks: AnthropicContentBlock[] = [];
  for (const p of parts) {
    if (p.type === "text") {
      blocks.push({ type: "text", text: p.text });
    } else {
      const { data, mediaType } = await resolveImageToBase64(p, "anthropic");
      blocks.push({ type: "image", source: { type: "base64", media_type: mediaType, data } });
    }
  }
  return blocks;
}

export async function toAnthropicMessages(messages: NormalizedMessage[]): Promise<Anthropic.MessageParam[]> {
  const out: Anthropic.MessageParam[] = [];
  for (const m of messages) {
    if (m.role === "SYSTEM") continue;
    out.push({ role: m.role === "ASSISTANT" ? "assistant" : "user", content: await toAnthropicContent(m.content) });
  }
  return out;
}

export function normalizeAnthropicError(err: unknown, modelId: string): AICoreError {
  if (err instanceof Anthropic.APIConnectionTimeoutError) return new AICoreError("TIMEOUT", "Anthropic request timed out.", { provider: "anthropic", modelId, fromProvider: true });
  if (err instanceof Anthropic.APIConnectionError) return new AICoreError("NETWORK_ERROR", "Could not reach Anthropic.", { provider: "anthropic", modelId, fromProvider: true });
  if (err instanceof Anthropic.AuthenticationError) return new AICoreError("AUTHENTICATION_ERROR", "Anthropic rejected the API key.", { provider: "anthropic", modelId, providerStatus: 401, fromProvider: true });
  if (err instanceof Anthropic.RateLimitError) return new AICoreError("RATE_LIMITED", "Anthropic rate limit reached.", { provider: "anthropic", modelId, providerStatus: 429, fromProvider: true });
  if (err instanceof Anthropic.BadRequestError) {
    const msg = err.message?.toLowerCase() ?? "";
    if (msg.includes("context") || msg.includes("too long") || msg.includes("maximum")) return new AICoreError("CONTEXT_LIMIT_EXCEEDED", "Request exceeds the model's context window.", { provider: "anthropic", modelId, providerStatus: 400, fromProvider: true });
    return new AICoreError("INVALID_REQUEST", "Anthropic rejected the request as invalid.", { provider: "anthropic", modelId, providerStatus: 400, fromProvider: true });
  }
  if (err instanceof Anthropic.InternalServerError || err instanceof Anthropic.APIError) return new AICoreError("PROVIDER_UNAVAILABLE", "Anthropic returned a server error.", { provider: "anthropic", modelId, providerStatus: (err as { status?: number }).status, fromProvider: true });
  return new AICoreError("UNKNOWN_PROVIDER_ERROR", "Unrecognized Anthropic error.", { provider: "anthropic", modelId, fromProvider: true });
}

class AnthropicProviderAdapter implements AIProvider {
  readonly id = "anthropic" as const;
  readonly displayName = "Anthropic";
  private client: Anthropic | null = null;
  isConfigured(): boolean { return isAIProviderKeyConfigured("anthropic"); }
  private getClient(): Anthropic {
    if (!this.isConfigured()) throw new AICoreError("PROVIDER_UNAVAILABLE", "Anthropic is not configured (ANTHROPIC_API_KEY unset).", { provider: "anthropic", fromProvider: false });
    if (!this.client) this.client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    return this.client;
  }
  async generate(request: ProviderGenerationRequest): Promise<ProviderGenerationResponse> {
    const startedAt = Date.now();
    try {
      const client = this.getClient();
      const message = await client.messages.create({
        model: request.modelId,
        max_tokens: request.config.maxOutputTokens ?? 4096,
        system: request.systemInstruction,
        messages: await toAnthropicMessages(request.messages),
        temperature: request.config.temperature,
        stop_sequences: request.config.stopSequences,
      });
      const textBlock = message.content.find((b) => b.type === "text");
      return {
        content: textBlock?.type === "text" ? textBlock.text : "",
        finishReason: normalizeAnthropicStopReason(message.stop_reason),
        rawFinishReason: message.stop_reason,
        usage: { kind: "PROVIDER_REPORTED", inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens, totalTokens: message.usage.input_tokens + message.usage.output_tokens },
        providerRequestId: message.id,
        latencyMs: Date.now() - startedAt,
      };
    } catch (err) {
      if (err instanceof AICoreError) throw err;
      throw normalizeAnthropicError(err, request.modelId);
    }
  }
  async *generateStream(request: ProviderStreamRequest): AsyncGenerator<StreamEvent, void, unknown> {
    const startedAt = Date.now();
    let client: Anthropic;
    try {
      client = this.getClient();
    } catch (err) {
      const normalized = err instanceof AICoreError ? err : normalizeAnthropicError(err, request.modelId);
      yield { type: "STREAM_ERROR", code: normalized.code, message: normalized.message };
      return;
    }
    yield { type: "STREAM_STARTED", provider: "anthropic", modelId: request.modelId };
    try {
      const anthropicMessages = await toAnthropicMessages(request.messages);
      const stream = client.messages.stream({
        model: request.modelId,
        max_tokens: request.config.maxOutputTokens ?? 4096,
        system: request.systemInstruction,
        messages: anthropicMessages,
        temperature: request.config.temperature,
        stop_sequences: request.config.stopSequences,
      });
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          yield { type: "CONTENT_DELTA", delta: event.delta.text };
        }
      }
      const final = await stream.finalMessage();
      yield { type: "USAGE", usage: { kind: "PROVIDER_REPORTED", inputTokens: final.usage.input_tokens, outputTokens: final.usage.output_tokens, totalTokens: final.usage.input_tokens + final.usage.output_tokens } };
      yield { type: "STREAM_COMPLETED", finishReason: normalizeAnthropicStopReason(final.stop_reason), rawFinishReason: final.stop_reason, totalLatencyMs: Date.now() - startedAt };
    } catch (err) {
      const normalized = err instanceof AICoreError ? err : normalizeAnthropicError(err, request.modelId);
      yield { type: "STREAM_ERROR", code: normalized.code, message: normalized.message };
    }
  }
}
export const anthropicProvider = new AnthropicProviderAdapter();
