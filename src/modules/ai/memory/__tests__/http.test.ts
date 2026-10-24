/**
 * Deterministic tests for the bounded body reader using in-memory
 * ReadableStreams. They prove this handler's own byte accounting and early
 * stop; they do NOT prove hosting-platform / proxy request-size limits.
 */
import { describe, it, expect } from "vitest";
import { readBoundedJson, MAX_MEMORY_REQUEST_BYTES as MAX } from "../http";

const enc = new TextEncoder();
type Init = RequestInit & { duplex?: "half" };

/** A JSON object whose UTF-8 byte length is exactly `bytes` (padding with trailing spaces). */
function jsonOfBytes(bytes: number, content = "x"): string {
  const base = JSON.stringify({ content });
  return base + " ".repeat(bytes - enc.encode(base).byteLength);
}
function requestFromChunks(chunks: Uint8Array[], headers: Record<string, string> = {}, onCancel?: () => void, onPull?: () => void): Request {
  let i = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      onPull?.();
      if (i < chunks.length) controller.enqueue(chunks[i++]!);
      else controller.close();
    },
    cancel() { onCancel?.(); },
  });
  return new Request("http://x/api", { method: "POST", body: stream, headers, duplex: "half" } as Init);
}
const bodyOf = (text: string, headers: Record<string, string> = {}) => new Request("http://x/api", { method: "POST", body: text, headers });
const status = (r: Awaited<ReturnType<typeof readBoundedJson>>) => (r.ok ? 200 : r.response.status);
async function errorBody(r: Awaited<ReturnType<typeof readBoundedJson>>) { if (r.ok) throw new Error("expected failure"); return r.response.json(); }

describe("limits by actual bytes", () => {
  it("1. a body below the limit is accepted and parsed", async () => {
    const r = await readBoundedJson(bodyOf(JSON.stringify({ type: "BUSINESS_FACT", content: "ok" })));
    expect(r).toEqual({ ok: true, data: { type: "BUSINESS_FACT", content: "ok" } });
  });
  it("2. a body of exactly the limit is accepted", async () => {
    const text = jsonOfBytes(MAX);
    expect(enc.encode(text).byteLength).toBe(MAX);
    expect((await readBoundedJson(bodyOf(text))).ok).toBe(true);
  });
  it("3. a body one byte over the limit is rejected as too large (400)", async () => {
    const text = jsonOfBytes(MAX + 1);
    expect(enc.encode(text).byteLength).toBe(MAX + 1);
    const r = await readBoundedJson(bodyOf(text));
    expect(status(r)).toBe(400);
    expect(await errorBody(r)).toMatchObject({ error: { code: "VALIDATION_ERROR", message: "The request body is too large." } });
  });
  it("4. multibyte UTF-8 is measured in bytes, not JavaScript characters", async () => {
    // 6000 "€" = 6000 UTF-16 units (< 16384, so a string-length check would accept) but 18000 bytes.
    const text = JSON.stringify({ content: "€".repeat(6000) });
    expect(text.length).toBeLessThan(MAX);
    expect(enc.encode(text).byteLength).toBeGreaterThan(MAX);
    expect(status(await readBoundedJson(bodyOf(text)))).toBe(400);
    // The same characters under the byte limit are accepted and decoded correctly.
    const ok = await readBoundedJson(bodyOf(JSON.stringify({ content: "€😀é".repeat(100) })));
    expect(ok).toEqual({ ok: true, data: { content: "€😀é".repeat(100) } });
    // Exactly at the limit with multibyte content.
    const exact = jsonOfBytes(MAX, "€".repeat(100));
    expect(enc.encode(exact).byteLength).toBe(MAX);
    expect((await readBoundedJson(bodyOf(exact))).ok).toBe(true);
  });
  it("a multibyte character split across two stream chunks is decoded correctly", async () => {
    const bytes = enc.encode(JSON.stringify({ content: "a€b" }));
    const cut = bytes.indexOf(0xe2) + 1; // splits the 3-byte "€" in the middle
    const r = await readBoundedJson(requestFromChunks([bytes.slice(0, cut), bytes.slice(cut)]));
    expect(r).toEqual({ ok: true, data: { content: "a€b" } });
  });
});

describe("Content-Length cannot bypass the limit", () => {
  it("5a. a missing Content-Length (streamed body) is still bounded", async () => {
    const req = requestFromChunks([enc.encode(jsonOfBytes(MAX + 1))]);
    expect(req.headers.get("content-length")).toBeNull();
    expect(status(await readBoundedJson(req))).toBe(400);
  });
  it("5b. an understated Content-Length is ignored; actual bytes are counted", async () => {
    const req = bodyOf(jsonOfBytes(MAX + 500), { "content-length": "10" });
    expect(status(await readBoundedJson(req))).toBe(400);
  });
  it("5c. an overstated Content-Length is rejected early without reading the body", async () => {
    let pulls = 0;
    const req = requestFromChunks([enc.encode("{}")], { "content-length": "999999" }, undefined, () => { pulls++; });
    expect(status(await readBoundedJson(req))).toBe(400);
    expect(pulls).toBe(0);
  });
  it("5d. a garbage Content-Length does not disable counting", async () => {
    expect(status(await readBoundedJson(bodyOf(jsonOfBytes(MAX + 1), { "content-length": "abc" })))).toBe(400);
    expect((await readBoundedJson(bodyOf("{}", { "content-length": "abc" }))).ok).toBe(true);
  });
});

describe("6. oversized streams are cut off before being fully buffered", () => {
  it("stops pulling and cancels the stream shortly after the limit is crossed", async () => {
    const chunk = enc.encode("a".repeat(1024));
    const TOTAL_CHUNKS = 10_000; // ~10 MB offered
    let pulls = 0; let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(c) { pulls++; if (pulls <= TOTAL_CHUNKS) c.enqueue(chunk); else c.close(); },
      cancel() { cancelled = true; },
    });
    const req = new Request("http://x/api", { method: "POST", body: stream, duplex: "half" } as Init);
    const r = await readBoundedJson(req);
    expect(status(r)).toBe(400);
    expect(cancelled).toBe(true);
    // 16 KiB / 1 KiB = 16 chunks to reach the limit; allow a small read-ahead, but nowhere near 10,000.
    expect(pulls).toBeLessThan(25);
  });
  it("a small chunk size cannot slip past: many tiny chunks are summed", async () => {
    const chunks = Array.from({ length: MAX + 1 }, () => enc.encode(" "));
    let cancelled = false;
    expect(status(await readBoundedJson(requestFromChunks(chunks, {}, () => { cancelled = true; })))).toBe(400);
    expect(cancelled).toBe(true);
  });
});

describe("7. malformed, missing and failing bodies are safe 400s", () => {
  it("malformed JSON", async () => {
    const r = await readBoundedJson(bodyOf("{not json"));
    expect(status(r)).toBe(400);
    expect(await errorBody(r)).toMatchObject({ error: { code: "VALIDATION_ERROR", message: "The request body must be valid JSON." } });
  });
  it("an empty or missing body", async () => {
    expect(status(await readBoundedJson(bodyOf("")))).toBe(400);
    expect(status(await readBoundedJson(new Request("http://x/api", { method: "POST" })))).toBe(400);
  });
  it("invalid UTF-8", async () => {
    expect(status(await readBoundedJson(requestFromChunks([new Uint8Array([0x7b, 0x22, 0xff, 0xfe, 0x22, 0x7d])])))).toBe(400);
  });
  it("a stream that errors mid-read, without leaking the underlying error", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(c) { c.enqueue(enc.encode('{"a":')); },
      pull() { throw new Error("secret internal disk path /var/x"); },
    });
    const r = await readBoundedJson(new Request("http://x/api", { method: "POST", body: stream, duplex: "half" } as Init));
    expect(status(r)).toBe(400);
    expect(JSON.stringify(await errorBody(r))).not.toMatch(/secret|\/var/);
  });
});
