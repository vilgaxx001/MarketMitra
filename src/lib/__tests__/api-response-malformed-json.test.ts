/**
 * Regression: a malformed/empty JSON body on any route that calls `await req.json()` (20 legacy routes, 5 of them public) answered
 * 500 INTERNAL_ERROR and logged an "Unhandled API error". It is a client error: 400 VALIDATION_ERROR without the parser's text.
 * REAL: withApiHandler and the Web `Request` JSON parser. DOUBLE: the logger (asserted not to be called with an error).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
const logger = vi.hoisted(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger }));
import { withApiHandler } from "@/lib/api-response";

const post = (body: string | undefined) => new Request("http://localhost/api/x", { method: "POST", body, headers: { "content-type": "application/json" } });
const route = withApiHandler(async (req) => { await req.json(); return new Response("ok") as never; });
beforeEach(() => Object.values(logger).forEach((f) => f.mockClear()));

describe("withApiHandler malformed JSON", () => {
  for (const [name, body] of [["malformed", "{bad"], ["empty", ""], ["truncated", '{"a":'], ["not an object start", "<html>"]] as const) {
    it(`${name} body -> 400 VALIDATION_ERROR, no parser text, no error log`, async () => {
      const res = await route(post(body));
      const json = await res.json();
      expect(res.status).toBe(400);
      expect(json.error.code).toBe("VALIDATION_ERROR");
      expect(JSON.stringify(json)).not.toMatch(/Unexpected|position|token/i);
      expect(logger.error).not.toHaveBeenCalled();
    });
  }
  it("a valid body still reaches the handler", async () => {
    expect((await route(post('{"a":1}'))).status).toBe(200);
  });
  it("other SyntaxErrors and ordinary errors stay 500 INTERNAL_ERROR and are logged", async () => {
    for (const e of [new SyntaxError("Invalid regular expression"), new Error("boom")]) {
      const res = await withApiHandler(async () => { throw e; })(new Request("http://localhost/x"));
      expect(res.status).toBe(500);
      expect((await res.json()).error.code).toBe("INTERNAL_ERROR");
    }
    expect(logger.error).toHaveBeenCalledTimes(2);
  });
});
