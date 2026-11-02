/**
 * Shared bounded JSON reader: content-type / encoding policy, per-class limits, and the guarantees that make the limit real
 * (counted on actual bytes while streaming, stream read once, rejected requests never read). Byte-accounting edge cases
 * (multibyte split across chunks, early cancel, garbage Content-Length ...) are covered in
 * src/modules/ai/memory/__tests__/http.test.ts, which exercises this same function.
 */
import { describe, it, expect } from "vitest";
import { readBoundedJson, BODY_LIMITS } from "@/lib/bounded-json";

type Init = RequestInit & { duplex?: "half" };
const enc = new TextEncoder();

function streamed(chunks: Uint8Array[], headers: Record<string, string>, counters: { pulls: number; cancelled: boolean } = { pulls: 0, cancelled: false }) {
  let i = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(c) { counters.pulls++; if (i < chunks.length) c.enqueue(chunks[i++]!); else c.close(); },
    cancel() { counters.cancelled = true; },
  });
  return { req: new Request("http://x/api", { method: "POST", body, headers, duplex: "half" } as Init), counters };
}
const json = (text: string, headers: Record<string, string> = { "content-type": "application/json" }) => new Request("http://x/api", { method: "POST", body: text, headers });
const status = (r: Awaited<ReturnType<typeof readBoundedJson>>) => (r.ok ? 200 : r.response.status);
const code = async (r: Awaited<ReturnType<typeof readBoundedJson>>) => (r.ok ? null : (await r.response.clone().json()).error.code);
/** A valid JSON document of exactly `bytes` bytes. */
const exactly = (bytes: number) => { const base = JSON.stringify({ a: "" }); return JSON.stringify({ a: "x".repeat(bytes - enc.encode(base).byteLength) }); };

describe("content type", () => {
  it.each([
    ["application/json"], ["application/json; charset=utf-8"], ["Application/JSON"], ["application/json;charset=UTF-8"],
    ['application/json; charset="utf-8"'], ["application/vnd.api+json"], ["application/merge-patch+json"],
  ])("accepts %s", async (ct) => {
    expect(status(await readBoundedJson(json('{"a":1}', { "content-type": ct }), 100))).toBe(200);
  });
  it.each([
    ["text/plain"], ["text/plain;charset=UTF-8"], ["application/x-www-form-urlencoded"], ["multipart/form-data; boundary=x"],
    ["application/xml"], ["application/jsonp"], ["application/json-seq"], ["json"], [""], ["application/json; charset=latin1"],
    ["application/json; charset=utf-16"], ["application/ json"], ["text/json"],
  ])("rejects %j with 415 UNSUPPORTED_MEDIA_TYPE", async (ct) => {
    const r = await readBoundedJson(json('{"a":1}', { "content-type": ct }), 100);
    expect(status(r)).toBe(415);
    expect(await code(r)).toBe("UNSUPPORTED_MEDIA_TYPE");
  });
  it("a missing Content-Type is rejected (a bare text body gets text/plain from fetch, but a stream gets none)", async () => {
    const { req } = streamed([enc.encode('{"a":1}')], {});
    expect(status(await readBoundedJson(req, 100))).toBe(415);
  });
  it.each([["gzip"], ["br"], ["deflate"], ["gzip, br"]])("rejects Content-Encoding: %s (a compressed body is never decompressed here)", async (ce) => {
    expect(status(await readBoundedJson(json("{}", { "content-type": "application/json", "content-encoding": ce }), 100))).toBe(415);
  });
  it("accepts Content-Encoding: identity", async () => {
    expect(status(await readBoundedJson(json("{}", { "content-type": "application/json", "content-encoding": "identity" }), 100))).toBe(200);
  });
  it("is decided BEFORE any byte is read: the stream is cancelled, not pulled to the end", async () => {
    const counters = { pulls: 0, cancelled: false };
    const big = new Uint8Array(1 << 20);
    const { req } = streamed([big, big, big], { "content-type": "text/plain" }, counters);
    expect(status(await readBoundedJson(req, 1024))).toBe(415);
    expect(counters.cancelled).toBe(true);
    expect(counters.pulls).toBeLessThanOrEqual(1);
  });
});

describe("size limits by endpoint class: exactly the limit passes, one byte over is refused", () => {
  for (const [name, limit] of Object.entries(BODY_LIMITS)) {
    it(`${name} (${limit} bytes)`, async () => {
      expect(status(await readBoundedJson(json(exactly(limit)), limit))).toBe(200);
      const over = await readBoundedJson(json(exactly(limit + 1)), limit);
      expect(status(over)).toBe(400);
      expect(await code(over)).toBe("VALIDATION_ERROR");
      const body = over.ok ? null : await over.response.clone().json();
      expect(body.error.message).toBe("The request body is too large.");
    });
  }
  it("the classes are ordered by what the endpoints legitimately carry", () => {
    expect(BODY_LIMITS.auth).toBeLessThan(BODY_LIMITS.publicForm);
    expect(BODY_LIMITS.publicForm).toBeLessThanOrEqual(BODY_LIMITS.control);
    expect(BODY_LIMITS.control).toBeLessThan(BODY_LIMITS.profile);
    expect(BODY_LIMITS.profile).toBeLessThanOrEqual(4 * 1024 * 1024); // never above the framework buffer cap in next.config.js
  });
});

describe("the limit is enforced on the bytes actually received", () => {
  it("chunked (no Content-Length): refused once the running total crosses the limit, and the stream is cancelled", async () => {
    const counters = { pulls: 0, cancelled: false };
    const chunks = Array.from({ length: 100 }, () => enc.encode("x".repeat(1000)));
    const { req } = streamed(chunks, { "content-type": "application/json" }, counters);
    const r = await readBoundedJson(req, 5_000);
    expect(status(r)).toBe(400);
    expect(counters.cancelled).toBe(true);
    expect(counters.pulls).toBeLessThanOrEqual(7); // 5 chunks reach the limit, one more crosses it: never the remaining ~94
  });
  it("an understated Content-Length does not let more through", async () => {
    const { req } = streamed([enc.encode(exactly(2_000))], { "content-type": "application/json", "content-length": "10" });
    expect(status(await readBoundedJson(req, 1_000))).toBe(400);
  });
  it("an overstated Content-Length is refused without reading", async () => {
    const counters = { pulls: 0, cancelled: false };
    const { req } = streamed([enc.encode("{}")], { "content-type": "application/json", "content-length": "999999" }, counters);
    expect(status(await readBoundedJson(req, 1_000))).toBe(400);
    expect(counters.pulls).toBe(0);
  });
  it("a chunked body just under the limit is accepted across many chunks", async () => {
    const text = exactly(4_000); const bytes = enc.encode(text);
    const chunks = Array.from({ length: 40 }, (_, i) => bytes.slice(i * 100, (i + 1) * 100));
    const { req } = streamed(chunks, { "content-type": "application/json" });
    expect(status(await readBoundedJson(req, 4_000))).toBe(200);
  });
});

describe("malformed bodies are 400s that echo nothing", () => {
  it.each([["{not json"], ["{\"a\":"], ["undefined"], ["\u0000"]])("%j", async (text) => {
    const r = await readBoundedJson(json(text), 1_000);
    expect(status(r)).toBe(400);
    const body = JSON.stringify(await (r.ok ? null : r.response.clone().json()));
    expect(body).not.toMatch(/Unexpected|position|token|JSON\.parse/i);
  });
  it("valid JSON that is not an object is returned as-is for the route's schema to judge", async () => {
    const r = await readBoundedJson(json("[1,2]"), 100);
    expect(r.ok && r.data).toEqual([1, 2]);
  });
});

describe("the stream is consumed exactly once", () => {
  it("after a successful read the body is used up; a second read fails instead of silently returning nothing", async () => {
    const req = json('{"a":1}');
    const first = await readBoundedJson(req, 100);
    expect(first.ok && first.data).toEqual({ a: 1 });
    expect(req.bodyUsed).toBe(true);
    await expect(req.json()).rejects.toThrow();
  });
});
