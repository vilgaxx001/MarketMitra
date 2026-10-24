import { describe, it, expect } from "vitest";
import { toOpenAIMessages } from "@/modules/ai/core/providers/openai.provider";
import { toAnthropicMessages } from "@/modules/ai/core/providers/anthropic.provider";
import { toGeminiContents } from "@/modules/ai/core/providers/gemini.provider";
import type { NormalizedMessage } from "@/modules/ai/core/types/message";

// A 1x1 transparent PNG, inline as a data: URI — real bytes, no network
// fetch needed, so these tests are fast and hermetic.
const TINY_PNG_DATA_URI =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

describe("vision translation — image parts reach the provider request, never silently dropped", () => {
  it("OpenAI: a message with an image part becomes a mixed content array with an image_url part", () => {
    const messages: NormalizedMessage[] = [
      { role: "USER", content: [{ type: "text", text: "what is this?" }, { type: "image", url: TINY_PNG_DATA_URI }] },
    ];
    const out = toOpenAIMessages(messages);
    const userMsg = out.find((m) => m.role === "user")!;
    expect(Array.isArray(userMsg.content)).toBe(true);
    const parts = userMsg.content as Array<{ type: string }>;
    expect(parts.some((p) => p.type === "image_url")).toBe(true);
    expect(parts.some((p) => p.type === "text")).toBe(true);
  });

  it("OpenAI: a text-only message stays a plain string (no behavior change for the common case)", () => {
    const out = toOpenAIMessages([{ role: "USER", content: [{ type: "text", text: "hi" }] }]);
    expect(typeof out.find((m) => m.role === "user")!.content).toBe("string");
  });

  it("OpenAI: an image in an ASSISTANT message is rejected explicitly, not silently dropped", () => {
    const messages: NormalizedMessage[] = [{ role: "ASSISTANT", content: [{ type: "image", url: TINY_PNG_DATA_URI }] }];
    expect(() => toOpenAIMessages(messages)).toThrow(/does not accept image content/);
  });

  it("Anthropic: a message with an image part becomes a content-block array with a base64 image block", async () => {
    const messages: NormalizedMessage[] = [
      { role: "USER", content: [{ type: "text", text: "what is this?" }, { type: "image", url: TINY_PNG_DATA_URI }] },
    ];
    const out = await toAnthropicMessages(messages);
    const userMsg = out.find((m) => m.role === "user")!;
    expect(Array.isArray(userMsg.content)).toBe(true);
    const blocks = userMsg.content as Array<{ type: string; source?: { type: string; media_type: string; data: string } }>;
    const imageBlock = blocks.find((b) => b.type === "image");
    expect(imageBlock).toBeTruthy();
    expect(imageBlock!.source!.type).toBe("base64");
    expect(imageBlock!.source!.media_type).toBe("image/png");
    expect(imageBlock!.source!.data.length).toBeGreaterThan(0);
  });

  it("Anthropic: a malformed data: URI throws INVALID_REQUEST rather than sending garbage to the provider", async () => {
    const messages: NormalizedMessage[] = [{ role: "USER", content: [{ type: "image", url: "data:not-a-real-data-uri" }] }];
    await expect(toAnthropicMessages(messages)).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });

  it("Anthropic: a text-only message stays a plain string", async () => {
    const out = await toAnthropicMessages([{ role: "USER", content: [{ type: "text", text: "hi" }] }]);
    expect(typeof out.find((m) => m.role === "user")!.content).toBe("string");
  });
  it("Gemini: a message with an image part becomes parts with an inlineData entry (base64 + mimeType)", async () => {
    const messages: NormalizedMessage[] = [
      { role: "USER", content: [{ type: "text", text: "what is this?" }, { type: "image", url: TINY_PNG_DATA_URI }] },
    ];
    const out = await toGeminiContents(messages);
    const userContent = out.find((c) => c.role === "user")!;
    const inline = userContent.parts.find((p) => "inlineData" in p && p.inlineData);
    expect(inline).toBeTruthy();
    expect((inline as { inlineData: { mimeType: string; data: string } }).inlineData.mimeType).toBe("image/png");
    expect((inline as { inlineData: { mimeType: string; data: string } }).inlineData.data.length).toBeGreaterThan(0);
    expect(userContent.parts.some((p) => "text" in p && p.text === "what is this?")).toBe(true);
  });

  it("Gemini: SYSTEM messages are excluded from contents (handled via systemInstruction instead)", async () => {
    const out = await toGeminiContents([
      { role: "SYSTEM", content: [{ type: "text", text: "be helpful" }] },
      { role: "USER", content: [{ type: "text", text: "hi" }] },
    ]);
    expect(out.length).toBe(1);
    expect(out[0]!.role).toBe("user");
  });
});
