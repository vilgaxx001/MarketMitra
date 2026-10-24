import { describe, it, expect, afterEach, vi } from "vitest";
import OpenAI from "openai";
import { openAIProvider } from "@/modules/ai/core/providers/openai.provider";
import { anthropicProvider } from "@/modules/ai/core/providers/anthropic.provider";
import { geminiProvider } from "@/modules/ai/core/providers/gemini.provider";
import type { StreamEvent } from "@/modules/ai/core/types/streaming";

async function collect(gen: AsyncGenerator<StreamEvent, void, unknown>): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  for await (const e of gen) events.push(e);
  return events;
}

const streamRequest = {
  modelId: "gpt-4o-mini",
  messages: [{ role: "USER" as const, content: [{ type: "text" as const, text: "hi" }] }],
  config: {},
  stream: true as const,
};

/** Builds an async iterable shaped exactly like an OpenAI SDK streaming response (native chunk shape). */
function fakeOpenAIStream(chunks: unknown[]): AsyncIterable<unknown> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const c of chunks) yield c;
    },
  };
}

describe("OpenAI streaming normalization (real adapter, SDK layer mocked — no network)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("emits STREAM_STARTED, one CONTENT_DELTA per native chunk (no re-chunking), USAGE only when the provider reports it, then STREAM_COMPLETED with a normalized finish reason", async () => {
    vi.spyOn(OpenAI.Chat.Completions.prototype, "create").mockResolvedValue(
      fakeOpenAIStream([
        { choices: [{ delta: { content: "Hel" }, finish_reason: null }] },
        { choices: [{ delta: { content: "lo" }, finish_reason: null }] },
        { choices: [{ delta: {}, finish_reason: "stop" }] },
        { choices: [], usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 } },
      ]) as never
    );

    const events = await collect(openAIProvider.generateStream!(streamRequest));
    expect(events[0]).toMatchObject({ type: "STREAM_STARTED", provider: "openai" });

    const deltas = events.filter((e) => e.type === "CONTENT_DELTA");
    expect(deltas.map((d) => (d as { delta: string }).delta)).toEqual(["Hel", "lo"]); // exactly the native chunks, not merged or split

    const usage = events.filter((e) => e.type === "USAGE");
    expect(usage.length).toBe(1);
    expect(usage[0]).toMatchObject({ usage: { kind: "PROVIDER_REPORTED", totalTokens: 5 } });

    const last = events[events.length - 1]!;
    expect(last).toMatchObject({ type: "STREAM_COMPLETED", finishReason: "STOP", rawFinishReason: "stop" });
    expect((last as { totalLatencyMs: number }).totalLatencyMs).toBeGreaterThanOrEqual(0);
  });

  it("does NOT emit a USAGE event when the provider never reports usage", async () => {
    vi.spyOn(OpenAI.Chat.Completions.prototype, "create").mockResolvedValue(
      fakeOpenAIStream([
        { choices: [{ delta: { content: "hi" }, finish_reason: null }] },
        { choices: [{ delta: {}, finish_reason: "stop" }] },
      ]) as never
    );
    const events = await collect(openAIProvider.generateStream!(streamRequest));
    expect(events.some((e) => e.type === "USAGE")).toBe(false);
  });

  it("normalizes a length finish reason", async () => {
    vi.spyOn(OpenAI.Chat.Completions.prototype, "create").mockResolvedValue(
      fakeOpenAIStream([{ choices: [{ delta: { content: "x" }, finish_reason: "length" }] }]) as never
    );
    const events = await collect(openAIProvider.generateStream!(streamRequest));
    expect(events[events.length - 1]).toMatchObject({ type: "STREAM_COMPLETED", finishReason: "LENGTH" });
  });

  it("a provider error becomes a normalized STREAM_ERROR and terminates — no STREAM_COMPLETED follows", async () => {
    vi.spyOn(OpenAI.Chat.Completions.prototype, "create").mockRejectedValue(new OpenAI.RateLimitError(429, undefined, "rate limited", {}));
    const events = await collect(openAIProvider.generateStream!(streamRequest));
    expect(events[0]).toMatchObject({ type: "STREAM_STARTED" });
    const last = events[events.length - 1]!;
    expect(last).toMatchObject({ type: "STREAM_ERROR", code: "RATE_LIMITED" });
    expect(events.some((e) => e.type === "STREAM_COMPLETED")).toBe(false);
    expect((last as { message: string }).message).toBe("OpenAI rate limit reached."); // the adapter's own normalized text, not the raw SDK error message
  });

  it("an error thrown MID-stream (after some content) still ends in STREAM_ERROR, not a raw throw", async () => {
    vi.spyOn(OpenAI.Chat.Completions.prototype, "create").mockResolvedValue({
      async *[Symbol.asyncIterator]() {
        yield { choices: [{ delta: { content: "partial" }, finish_reason: null }] };
        throw new OpenAI.APIConnectionError({ message: "connection dropped" });
      },
    } as never);
    const events = await collect(openAIProvider.generateStream!(streamRequest));
    expect(events.some((e) => e.type === "CONTENT_DELTA")).toBe(true);
    expect(events[events.length - 1]).toMatchObject({ type: "STREAM_ERROR", code: "NETWORK_ERROR" });
  });
});


describe("stream error handling — an unconfigured provider yields STREAM_ERROR, never a raw throw", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ["openai", openAIProvider],
    ["anthropic", anthropicProvider],
    ["gemini", geminiProvider],
  ] as const)("%s: not configured -> single STREAM_ERROR event (PROVIDER_UNAVAILABLE), no STREAM_STARTED, generator terminates", async (_name, provider) => {
    vi.spyOn(provider, "isConfigured").mockReturnValue(false);
    const events = await collect(provider.generateStream!(streamRequest));
    expect(events.length).toBe(1);
    expect(events[0]).toMatchObject({ type: "STREAM_ERROR", code: "PROVIDER_UNAVAILABLE" });
  });
});
