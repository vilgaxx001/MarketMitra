/**
 * src/lib/bounded-json.ts
 *
 * Bounded JSON body reader (shared by the memory, AI preferences and AI execute routes). The limit is enforced WHILE
 * READING, in actual bytes:
 *   - the body stream is read chunk by chunk and the running byte total is
 *     checked after every chunk; on the first chunk that crosses the limit
 *     reading stops and the stream is cancelled, so at most one chunk beyond
 *     the limit is ever held in memory;
 *   - Content-Length is only an early-reject hint for honest clients. A
 *     missing, chunked or understated header cannot bypass the limit,
 *     because the bytes actually received are what is counted;
 *   - size is measured on the raw bytes, never on JavaScript string length
 *     (a "€" is 3 bytes but 1 UTF-16 unit).
 * Malformed UTF-8, malformed JSON, a missing body and stream read errors all
 * return the same safe VALIDATION_ERROR (400) envelope instead of a 500. The parser's
 * error message (which can contain a snippet of the body) is never logged or returned.
 *
 * Limits of this guarantee: it bounds what THIS handler buffers. Platform
 * or proxy limits (hosting provider, CDN, Next.js server) are separate and
 * are not tested or configured here.
 */
import { apiError } from "@/lib/api-response";

export type BoundedJsonResult = { ok: true; data: unknown } | { ok: false; response: ReturnType<typeof apiError> };

const tooLarge = (): BoundedJsonResult => ({ ok: false, response: apiError("VALIDATION_ERROR", "The request body is too large.") });
const invalidJson = (): BoundedJsonResult => ({ ok: false, response: apiError("VALIDATION_ERROR", "The request body must be valid JSON.") });
const unreadable = (): BoundedJsonResult => ({ ok: false, response: apiError("VALIDATION_ERROR", "The request body could not be read.") });

async function cancelQuietly(stream: ReadableStream<Uint8Array> | ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
  try { await stream.cancel(); } catch { /* best effort: nothing more to do if cancel itself fails */ }
}

/** `maxBytes` is required: every caller must choose its own documented limit. */
export async function readBoundedJson(req: Request, maxBytes: number): Promise<BoundedJsonResult> {
  const body = req.body;
  if (!body) return invalidJson(); // no body at all

  // Early reject for honest oversized declarations — never used to ACCEPT anything.
  const declaredHeader = req.headers.get("content-length");
  if (declaredHeader !== null && /^\d+$/.test(declaredHeader) && Number(declaredHeader) > maxBytes) {
    await cancelQuietly(body);
    return tooLarge();
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) { await cancelQuietly(reader); return unreadable(); }
      total += value.byteLength;
      if (total > maxBytes) { await cancelQuietly(reader); return tooLarge(); }
      chunks.push(value);
    }
  } catch {
    await cancelQuietly(reader);
    return unreadable();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) { bytes.set(c, offset); offset += c.byteLength; }

  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { ok: true, data: JSON.parse(text) as unknown };
  } catch {
    return invalidJson(); // invalid UTF-8 or invalid JSON
  }
}
