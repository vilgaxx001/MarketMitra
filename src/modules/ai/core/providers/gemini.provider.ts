import "server-only";
import { GoogleGenerativeAI, GoogleGenerativeAIFetchError } from "@google/generative-ai";
import type { Content, Part } from "@google/generative-ai";
import { env, isAIProviderKeyConfigured } from "@/lib/env";
import { AICoreError } from "../types/errors";
import { normalizeGeminiFinishReason } from "../types/finish-reason";
import { resolveImageToBase64 } from "./image-resolver";
import type { AIProvider, ProviderGenerationRequest, ProviderGenerationResponse, ProviderStreamRequest } from "../types/provider";
import type { StreamEvent } from "../types/streaming";
import type { NormalizedMessage, MessagePart } from "../types/message";

async function toGeminiParts(parts: MessagePart[]): Promise<Part[]> {
  const out: Part[] = [];
  for (const p of parts) {
    if (p.type === "text") {
      out.push({ text: p.text });
    } else {
      const { data, mediaType } = await resolveImageToBase64(p, "gemini");
      out.push({ inlineData: { mimeType: mediaType, data } });
    }
  }
  return out;
}

export async function toGeminiContents(messages: NormalizedMessage[]): Promise<Content[]> {
  const out: Content[] = [];
  for (const m of messages) {
    if (m.role === "SYSTEM") continue;
    out.push({ role: m.role === "ASSISTANT" ? "model" : "user", parts: await toGeminiParts(m.content) });
  }
  return out;
}

export function normalizeGeminiError(err: unknown, modelId: string): AICoreError {
  if (err instanceof GoogleGenerativeAIFetchError) {
    const status = err.status;
    if (status === 401 || status === 403) return new AICoreError("AUTHENTICATION_ERROR", "Google rejected the API key.", { provider: "gemini", modelId, providerStatus: status, fromProvider: true });
    if (status === 429) return new AICoreError("RATE_LIMITED", "Gemini rate limit reached.", { provider: "gemini", modelId, providerStatus: 429, fromProvider: true });
    if (status === 400) {
      const msg = err.message?.toLowerCase() ?? "";
      if (msg.includes("token") && (msg.includes("exceed") || msg.includes("limit"))) return new AICoreError("CONTEXT_LIMIT_EXCEEDED", "Request exceeds the model's context window.", { provider: "gemini", modelId, providerStatus: 400, fromProvider: true });
      return new AICoreError("INVALID_REQUEST", "Gemini rejected the request as invalid.", { provider: "gemini", modelId, providerStatus: 400, fromProvider: true });
    }
    if (status !== undefined && status >= 500) return new AICoreError("PROVIDER_UNAVAILABLE", "Gemini returned a server error.", { provider: "gemini", modelId, providerStatus: status, fromProvider: true });
  }
  if (err instanceof Error && /block|safety/i.test(err.message)) return new AICoreError("SAFETY_REFUSAL", "Gemini blocked this request on safety grounds.", { provider: "gemini", modelId, fromProvider: true });
  return new AICoreError("UNKNOWN_PROVIDER_ERROR", "Unrecognized Gemini error.", { provider: "gemini", modelId, fromProvider: true });
}

class GeminiProviderAdapter implements AIProvider {
  readonly id = "gemini" as const;
  readonly displayName = "Google Gemini";
  private client: GoogleGenerativeAI | null = null;
  isConfigured(): boolean { return isAIProviderKeyConfigured("gemini"); }
  private getClient(): GoogleGenerativeAI {
    if (!this.isConfigured()) throw new AICoreError("PROVIDER_UNAVAILABLE", "Gemini is not configured (GEMINI_API_KEY unset).", { provider: "gemini", fromProvider: false });
    if (!this.client) this.client = new GoogleGenerativeAI(env.GEMINI_API_KEY!);
    return this.client;
  }
  async generate(request: ProviderGenerationRequest): Promise<ProviderGenerationResponse> {
    const startedAt = Date.now();
    try {
      const client = this.getClient();
      const model = client.getGenerativeModel({ model: request.modelId, systemInstruction: request.systemInstruction });
      const result = await model.generateContent({
        contents: await toGeminiContents(request.messages),
        generationConfig: {
          maxOutputTokens: request.config.maxOutputTokens,
          temperature: request.config.temperature,
          stopSequences: request.config.stopSequences,
          ...(request.config.structuredOutput?.enabled && { responseMimeType: "application/json" }),
        },
      });
      if (result.response.promptFeedback?.blockReason) {
        throw new AICoreError("SAFETY_REFUSAL", `Gemini blocked the prompt: ${result.response.promptFeedback.blockReason}`, { provider: "gemini", modelId: request.modelId, fromProvider: true });
      }
      const candidate = result.response.candidates?.[0];
      const rawFinish = candidate?.finishReason ?? null;
      return {
        content: result.response.text(),
        finishReason: normalizeGeminiFinishReason(rawFinish),
        rawFinishReason: rawFinish,
        usage: result.response.usageMetadata ? { kind: "PROVIDER_REPORTED", inputTokens: result.response.usageMetadata.promptTokenCount, outputTokens: result.response.usageMetadata.candidatesTokenCount, totalTokens: result.response.usageMetadata.totalTokenCount } : { kind: "UNAVAILABLE" },
        latencyMs: Date.now() - startedAt,
      };
    } catch (err) {
      if (err instanceof AICoreError) throw err;
      throw normalizeGeminiError(err, request.modelId);
    }
  }
  async *generateStream(request: ProviderStreamRequest): AsyncGenerator<StreamEvent, void, unknown> {
    const startedAt = Date.now();
    let client: GoogleGenerativeAI;
    try {
      client = this.getClient();
    } catch (err) {
      const normalized = err instanceof AICoreError ? err : normalizeGeminiError(err, request.modelId);
      yield { type: "STREAM_ERROR", code: normalized.code, message: normalized.message };
      return;
    }
    yield { type: "STREAM_STARTED", provider: "gemini", modelId: request.modelId };
    try {
      const model = client.getGenerativeModel({ model: request.modelId, systemInstruction: request.systemInstruction });
      const result = await model.generateContentStream({
        contents: await toGeminiContents(request.messages),
        generationConfig: { maxOutputTokens: request.config.maxOutputTokens, temperature: request.config.temperature, stopSequences: request.config.stopSequences },
      });
      for await (const chunk of result.stream) {
        const text = chunk.text();
        if (text) yield { type: "CONTENT_DELTA", delta: text };
      }
      const final = await result.response;
      const rawFinish = final.candidates?.[0]?.finishReason ?? null;
      if (final.usageMetadata) yield { type: "USAGE", usage: { kind: "PROVIDER_REPORTED", inputTokens: final.usageMetadata.promptTokenCount, outputTokens: final.usageMetadata.candidatesTokenCount, totalTokens: final.usageMetadata.totalTokenCount } };
      yield { type: "STREAM_COMPLETED", finishReason: normalizeGeminiFinishReason(rawFinish), rawFinishReason: rawFinish, totalLatencyMs: Date.now() - startedAt };
    } catch (err) {
      const normalized = err instanceof AICoreError ? err : normalizeGeminiError(err, request.modelId);
      yield { type: "STREAM_ERROR", code: normalized.code, message: normalized.message };
    }
  }
}
export const geminiProvider = new GeminiProviderAdapter();
