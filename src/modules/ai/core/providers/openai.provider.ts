import "server-only";
import OpenAI from "openai";
import { env, isAIProviderKeyConfigured } from "@/lib/env";
import { AICoreError } from "../types/errors";
import { normalizeOpenAIFinishReason } from "../types/finish-reason";
import type { AIProvider, ProviderGenerationRequest, ProviderGenerationResponse, ProviderStreamRequest } from "../types/provider";
import type { StreamEvent } from "../types/streaming";
import type { NormalizedMessage } from "../types/message";

/**
 * Translates a NormalizedMessage's content parts into OpenAI's content
 * shape. Real image support: a message with any `image` parts becomes a
 * mixed content array (`image_url` + `text` parts), matching OpenAI's
 * vision API — never silently dropped. Text-only messages stay a plain
 * string for compatibility/brevity.
 */
function toOpenAIContent(parts: NormalizedMessage["content"]): string | OpenAI.Chat.ChatCompletionContentPart[] {
  const hasImage = parts.some((p) => p.type === "image");
  if (!hasImage) {
    return parts.filter((p): p is { type: "text"; text: string } => p.type === "text").map((p) => p.text).join("\n");
  }
  return parts.map((p): OpenAI.Chat.ChatCompletionContentPart =>
    p.type === "text" ? { type: "text", text: p.text } : { type: "image_url", image_url: { url: p.url } }
  );
}

export function toOpenAIMessages(messages: NormalizedMessage[], systemInstruction?: string): OpenAI.Chat.ChatCompletionMessageParam[] {
  const out: OpenAI.Chat.ChatCompletionMessageParam[] = [];
  if (systemInstruction) out.push({ role: "system", content: systemInstruction });
  for (const m of messages) {
    switch (m.role) {
      case "SYSTEM":
        // System messages never carry images in this contract (see message.ts) — always plain text.
        out.push({ role: "system", content: m.content.filter((p): p is { type: "text"; text: string } => p.type === "text").map((p) => p.text).join("\n") });
        break;
      case "USER":
        out.push({ role: "user", content: toOpenAIContent(m.content) });
        break;
      case "ASSISTANT":
        // OpenAI's assistant role only accepts text/refusal parts, not image_url — images in an ASSISTANT message are dropped with a hard error rather than silently, since that would misrepresent what was sent.
        if (m.content.some((p) => p.type === "image")) {
          throw new AICoreError("INVALID_REQUEST", "OpenAI does not accept image content in an ASSISTANT message.", { provider: "openai", fromProvider: false });
        }
        out.push({ role: "assistant", content: m.content.filter((p): p is { type: "text"; text: string } => p.type === "text").map((p) => p.text).join("\n") });
        break;
      case "TOOL":
        out.push({ role: "tool", content: m.content.filter((p): p is { type: "text"; text: string } => p.type === "text").map((p) => p.text).join("\n"), tool_call_id: m.toolCallId! });
        break;
    }
  }
  return out;
}

export function normalizeOpenAIError(err: unknown, modelId: string): AICoreError {
  if (err instanceof OpenAI.APIConnectionTimeoutError) return new AICoreError("TIMEOUT", "OpenAI request timed out.", { provider: "openai", modelId, fromProvider: true });
  if (err instanceof OpenAI.APIConnectionError) return new AICoreError("NETWORK_ERROR", "Could not reach OpenAI.", { provider: "openai", modelId, fromProvider: true });
  if (err instanceof OpenAI.AuthenticationError) return new AICoreError("AUTHENTICATION_ERROR", "OpenAI rejected the API key.", { provider: "openai", modelId, providerStatus: 401, fromProvider: true });
  if (err instanceof OpenAI.RateLimitError) return new AICoreError("RATE_LIMITED", "OpenAI rate limit reached.", { provider: "openai", modelId, providerStatus: 429, fromProvider: true });
  if (err instanceof OpenAI.BadRequestError) {
    const msg = err.message?.toLowerCase() ?? "";
    if (msg.includes("context length") || msg.includes("maximum context")) return new AICoreError("CONTEXT_LIMIT_EXCEEDED", "Request exceeds the model's context window.", { provider: "openai", modelId, providerStatus: 400, fromProvider: true });
    return new AICoreError("INVALID_REQUEST", "OpenAI rejected the request as invalid.", { provider: "openai", modelId, providerStatus: 400, fromProvider: true });
  }
  if (err instanceof OpenAI.InternalServerError || err instanceof OpenAI.APIError) return new AICoreError("PROVIDER_UNAVAILABLE", "OpenAI returned a server error.", { provider: "openai", modelId, providerStatus: (err as { status?: number }).status, fromProvider: true });
  return new AICoreError("UNKNOWN_PROVIDER_ERROR", "Unrecognized OpenAI error.", { provider: "openai", modelId, fromProvider: true });
}

class OpenAIProviderAdapter implements AIProvider {
  readonly id = "openai" as const;
  readonly displayName = "OpenAI";
  private client: OpenAI | null = null;
  isConfigured(): boolean { return isAIProviderKeyConfigured("openai"); }
  private getClient(): OpenAI {
    if (!this.isConfigured()) throw new AICoreError("PROVIDER_UNAVAILABLE", "OpenAI is not configured (OPENAI_API_KEY unset).", { provider: "openai", fromProvider: false });
    if (!this.client) this.client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    return this.client;
  }
  async generate(request: ProviderGenerationRequest): Promise<ProviderGenerationResponse> {
    const startedAt = Date.now();
    try {
      const client = this.getClient();
      const completion = await client.chat.completions.create({
        model: request.modelId,
        messages: toOpenAIMessages(request.messages, request.systemInstruction),
        max_completion_tokens: request.config.maxOutputTokens,
        temperature: request.config.temperature,
        stop: request.config.stopSequences,
        ...(request.config.structuredOutput?.enabled && { response_format: { type: "json_object" } }),
      });
      const choice = completion.choices[0];
      if (!choice) throw new AICoreError("MALFORMED_OUTPUT", "OpenAI returned no choices.", { provider: "openai", modelId: request.modelId, fromProvider: true });
      return {
        content: choice.message.content ?? "",
        finishReason: normalizeOpenAIFinishReason(choice.finish_reason),
        rawFinishReason: choice.finish_reason ?? null,
        usage: completion.usage ? { kind: "PROVIDER_REPORTED", inputTokens: completion.usage.prompt_tokens, outputTokens: completion.usage.completion_tokens, totalTokens: completion.usage.total_tokens } : { kind: "UNAVAILABLE" },
        providerRequestId: completion.id,
        latencyMs: Date.now() - startedAt,
      };
    } catch (err) {
      if (err instanceof AICoreError) throw err;
      throw normalizeOpenAIError(err, request.modelId);
    }
  }
  async *generateStream(request: ProviderStreamRequest): AsyncGenerator<StreamEvent, void, unknown> {
    const startedAt = Date.now();
    let client: OpenAI;
    try {
      client = this.getClient();
    } catch (err) {
      const normalized = err instanceof AICoreError ? err : normalizeOpenAIError(err, request.modelId);
      yield { type: "STREAM_ERROR", code: normalized.code, message: normalized.message };
      return;
    }
    yield { type: "STREAM_STARTED", provider: "openai", modelId: request.modelId };
    try {
      const stream = await client.chat.completions.create({
        model: request.modelId,
        messages: toOpenAIMessages(request.messages, request.systemInstruction),
        max_completion_tokens: request.config.maxOutputTokens,
        temperature: request.config.temperature,
        stop: request.config.stopSequences,
        stream: true,
        stream_options: { include_usage: true },
      });
      let finishReason: string | null = null;
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) yield { type: "CONTENT_DELTA", delta };
        if (chunk.choices[0]?.finish_reason) finishReason = chunk.choices[0].finish_reason;
        if (chunk.usage) yield { type: "USAGE", usage: { kind: "PROVIDER_REPORTED", inputTokens: chunk.usage.prompt_tokens, outputTokens: chunk.usage.completion_tokens, totalTokens: chunk.usage.total_tokens } };
      }
      yield { type: "STREAM_COMPLETED", finishReason: normalizeOpenAIFinishReason(finishReason), rawFinishReason: finishReason, totalLatencyMs: Date.now() - startedAt };
    } catch (err) {
      const normalized = err instanceof AICoreError ? err : normalizeOpenAIError(err, request.modelId);
      yield { type: "STREAM_ERROR", code: normalized.code, message: normalized.message };
    }
  }
}
export const openAIProvider = new OpenAIProviderAdapter();
