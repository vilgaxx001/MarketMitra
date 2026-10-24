import { describe, it, expect } from "vitest";
import { normalizeOpenAIFinishReason, normalizeAnthropicStopReason, normalizeGeminiFinishReason } from "@/modules/ai/core/types/finish-reason";
describe("finish reason normalization", () => {
  it("OpenAI", () => {
    expect(normalizeOpenAIFinishReason("stop")).toBe("STOP");
    expect(normalizeOpenAIFinishReason("length")).toBe("LENGTH");
    expect(normalizeOpenAIFinishReason("tool_calls")).toBe("TOOL_CALL");
    expect(normalizeOpenAIFinishReason("content_filter")).toBe("CONTENT_FILTER");
    expect(normalizeOpenAIFinishReason(null)).toBe("UNKNOWN");
  });
  it("Anthropic", () => {
    expect(normalizeAnthropicStopReason("end_turn")).toBe("STOP");
    expect(normalizeAnthropicStopReason("max_tokens")).toBe("LENGTH");
    expect(normalizeAnthropicStopReason("tool_use")).toBe("TOOL_CALL");
  });
  it("Gemini", () => {
    expect(normalizeGeminiFinishReason("STOP")).toBe("STOP");
    expect(normalizeGeminiFinishReason("MAX_TOKENS")).toBe("LENGTH");
    expect(normalizeGeminiFinishReason("SAFETY")).toBe("SAFETY");
  });
});
