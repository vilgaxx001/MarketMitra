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
 *   - Oversized bodies are 400 VALIDATION_ERROR "The request body is too large." (not 413): that is the contract the AI
 *     routes and their tests already published, and one contract for every route beats two. The status is one line
 *     (STATUS_BY_CODE) if the API ever moves to 413.
 *   - Content-Type must be application/json (or +json) with no charset other than UTF-8, and Content-Encoding must be absent
 *     or identity: 415 UNSUPPORTED_MEDIA_TYPE, decided BEFORE any byte is read. A JSON endpoint that parses text/plain can be
 *     driven by a cross-site HTML form without a CORS preflight; and a compressed body is never decompressed here, so it can
 *     only ever be rejected, not expanded into memory.
 *
 * EVERY route that reads a JSON body goes through this function (a source scan in
 * src/lib/__tests__/route-body-guard.test.ts fails the build if a route calls req.json()/text()/formData() directly).
 * The stream is read exactly once, here.
 *
 * Framework note: Next.js buffers the body of any request that passes middleware (all /api routes except webhooks) and by
 * default keeps only the first 10 MiB (experimental.middlewareClientMaxBodySize). next.config.js lowers that to 4 MiB so the
 * framework's own buffering is bounded too; the per-route limits below are what actually decide acceptance.
 *
 * Limits of this guarantee: it bounds what THIS handler buffers. Platform
 * or proxy limits (hosting provider, CDN, Next.js server) are separate and
 * are not tested or configured here.
 */
import { apiError } from "@/lib/api-response";

export type BoundedJsonResult = { ok: true; data: unknown } | { ok: false; response: ReturnType<typeof apiError> };

/** Per endpoint class. Chosen from the worst payload each schema legitimately allows, at 4 bytes per character. */
export const BODY_LIMITS = {
  /** login, signup, forgot/reset-password, verify-email: the largest legitimate body (signup) is ~1.2 KB. */
  auth: 8 * 1024,
  /** public forms: contact (message <= 2000 chars) and demo-generate (description <= 500 chars + selections). */
  publicForm: 16 * 1024,
  /** small authenticated control payloads: team invites and role changes, asset upload initiate/confirm, invite accept, workspace create/update. */
  control: 16 * 1024,
  /** authenticated profile CRUD (business, brand, audience, onboarding): worst legitimate body is ~14k characters (~56 KB at 4 B/char). */
  profile: 64 * 1024,
} as const;

const JSON_MEDIA_TYPE = /^application\/(?:[a-z0-9!#$&^_.+-]+\+)?json$/i;

const unsupportedMediaType = (): BoundedJsonResult => ({
  ok: false,
  response: apiError("UNSUPPORTED_MEDIA_TYPE", "The request body must be sent as application/json."),
});

/** True when the request declares a JSON body in UTF-8 with no content coding. A missing Content-Type is NOT accepted. */
function isSupportedJsonRequest(req: Request): boolean {
  const encoding = req.headers.get("content-encoding");
  if (encoding !== null && encoding.trim() !== "" && encoding.trim().toLowerCase() !== "identity") return false;
  const raw = req.headers.get("content-type");
  if (raw === null) return false;
  const [mediaType, ...params] = raw.split(";").map((p) => p.trim());
  if (!mediaType || !JSON_MEDIA_TYPE.test(mediaType)) return false;
  for (const param of params) {
    const eq = param.indexOf("=");
    if (eq > 0 && param.slice(0, eq).trim().toLowerCase() === "charset") {
      const cs = param.slice(eq + 1).trim().replace(/^"|"$/g, "").toLowerCase();
      if (cs !== "utf-8" && cs !== "utf8") return false;
    }
  }
  return true;
}

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
  if (!isSupportedJsonRequest(req)) { await cancelQuietly(body); return unsupportedMediaType(); }

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
