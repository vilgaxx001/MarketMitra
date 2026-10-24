import { describe, it, expect } from "vitest";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAIFetchError } from "@google/generative-ai";
import { normalizeOpenAIError } from "@/modules/ai/core/providers/openai.provider";
import { normalizeAnthropicError } from "@/modules/ai/core/providers/anthropic.provider";
import { normalizeGeminiError } from "@/modules/ai/core/providers/gemini.provider";
import { AICoreError } from "@/modules/ai/core/types/errors";

describe("OpenAI error normalization", () => {
  it("AuthenticationError -> AUTHENTICATION_ERROR", () => {
    const n = normalizeOpenAIError(new OpenAI.AuthenticationError(401, undefined, "Invalid API key", {}), "gpt-4o");
    expect(n).toBeInstanceOf(AICoreError);
    expect(n.code).toBe("AUTHENTICATION_ERROR");
    expect(n.retryable).toBe(false);
  });
  it("RateLimitError -> RATE_LIMITED (retryable)", () => {
    const n = normalizeOpenAIError(new OpenAI.RateLimitError(429, undefined, "Rate limit exceeded", {}), "gpt-4o");
    expect(n.code).toBe("RATE_LIMITED");
    expect(n.retryable).toBe(true);
  });
  it("context-length BadRequestError -> CONTEXT_LIMIT_EXCEEDED", () => {
    const n = normalizeOpenAIError(new OpenAI.BadRequestError(400, undefined, "This model's maximum context length is 128000 tokens", {}), "gpt-4o");
    expect(n.code).toBe("CONTEXT_LIMIT_EXCEEDED");
  });
  it("generic BadRequestError -> INVALID_REQUEST", () => {
    expect(normalizeOpenAIError(new OpenAI.BadRequestError(400, undefined, "Invalid parameter", {}), "gpt-4o").code).toBe("INVALID_REQUEST");
  });
  it("APIConnectionTimeoutError -> TIMEOUT", () => {
    expect(normalizeOpenAIError(new OpenAI.APIConnectionTimeoutError(), "gpt-4o").code).toBe("TIMEOUT");
  });
  it("never lets raw SDK error escape", () => {
    const n = normalizeOpenAIError(new OpenAI.AuthenticationError(401, undefined, "x", {}), "gpt-4o");
    expect(n.details.provider).toBe("openai");
    expect(n.details.fromProvider).toBe(true);
  });
  it("unrecognized error -> UNKNOWN_PROVIDER_ERROR", () => {
    expect(normalizeOpenAIError(new Error("unexpected"), "gpt-4o").code).toBe("UNKNOWN_PROVIDER_ERROR");
  });
});

describe("Anthropic error normalization", () => {
  it("AuthenticationError", () => { expect(normalizeAnthropicError(new Anthropic.AuthenticationError(401, undefined, "x", {}), "claude-3-5-sonnet-20241022").code).toBe("AUTHENTICATION_ERROR"); });
  it("RateLimitError", () => { expect(normalizeAnthropicError(new Anthropic.RateLimitError(429, undefined, "x", {}), "claude-3-5-sonnet-20241022").code).toBe("RATE_LIMITED"); });
});

describe("Gemini error normalization", () => {
  it("401/403 -> AUTHENTICATION_ERROR", () => { expect(normalizeGeminiError(new GoogleGenerativeAIFetchError("x", 403, "Forbidden"), "gemini-1.5-pro").code).toBe("AUTHENTICATION_ERROR"); });
  it("429 -> RATE_LIMITED", () => { expect(normalizeGeminiError(new GoogleGenerativeAIFetchError("x", 429, "Too Many"), "gemini-1.5-pro").code).toBe("RATE_LIMITED"); });
  it("5xx -> PROVIDER_UNAVAILABLE", () => { expect(normalizeGeminiError(new GoogleGenerativeAIFetchError("x", 503, "Unavailable"), "gemini-1.5-pro").code).toBe("PROVIDER_UNAVAILABLE"); });
});
