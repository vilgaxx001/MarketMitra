import "server-only";
/**
 * src/modules/ai/core/providers/image-resolver.ts
 *
 * Shared base64 image resolution for adapters whose provider API needs
 * inline image bytes rather than a bare URL (Anthropic, Gemini) — OpenAI
 * accepts a URL directly and fetches it provider-side, so it does not
 * use this file.
 *
 * SECURITY NOTE: `resolveImageToBase64` performs a server-side fetch of
 * an arbitrary `http(s)://` URL when the image part isn't already a
 * `data:` URI. This is a real (if narrow) SSRF surface. Today nothing in
 * the public API route (`ai/execute/route.ts`) accepts image input at
 * all — this path is reachable only from trusted, future in-process
 * callers (Module 5D/6), not directly from arbitrary client input. A
 * future public API surface that accepts image URLs from end users would
 * need its own URL allowlist/validation layer before reaching this
 * function — that's a Module 5D/6/hardening concern, not solved here.
 */
import { AICoreError } from "../types/errors";
import type { MessagePart } from "../types/message";
import type { AIErrorCode } from "../types/errors";

export const MAX_IMAGE_FETCH_BYTES = 5 * 1024 * 1024; // 5MB — a conservative cap matching typical provider-side vision input limits
const IMAGE_FETCH_TIMEOUT_MS = 8_000;

export type NormalizedImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

export function normalizeImageMediaType(raw: string): NormalizedImageMediaType {
  const lower = raw.toLowerCase();
  if (lower.includes("png")) return "image/png";
  if (lower.includes("gif")) return "image/gif";
  if (lower.includes("webp")) return "image/webp";
  return "image/jpeg";
}

export interface ResolvedImage {
  data: string; // base64
  mediaType: NormalizedImageMediaType;
}

export async function resolveImageToBase64(
  part: Extract<MessagePart, { type: "image" }>,
  provider: string,
  invalidRequestCode: AIErrorCode = "INVALID_REQUEST"
): Promise<ResolvedImage> {
  if (part.url.startsWith("data:")) {
    const match = /^data:([^;]+);base64,(.+)$/.exec(part.url);
    if (!match) {
      throw new AICoreError(invalidRequestCode, "Malformed data: URI for image content.", { provider, fromProvider: false });
    }
    return { data: match[2]!, mediaType: normalizeImageMediaType(part.mimeType ?? match[1]!) };
  }

  let res: Response;
  try {
    res = await fetch(part.url, { signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS) });
  } catch {
    throw new AICoreError(invalidRequestCode, "Could not fetch the provided image URL.", { provider, fromProvider: false });
  }
  if (!res.ok) {
    throw new AICoreError(invalidRequestCode, `Image URL returned HTTP ${res.status}.`, { provider, fromProvider: false });
  }
  const contentLength = res.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_IMAGE_FETCH_BYTES) {
    throw new AICoreError(invalidRequestCode, "Image exceeds the maximum allowed size (5MB).", { provider, fromProvider: false });
  }
  const buffer = await res.arrayBuffer();
  if (buffer.byteLength > MAX_IMAGE_FETCH_BYTES) {
    throw new AICoreError(invalidRequestCode, "Image exceeds the maximum allowed size (5MB).", { provider, fromProvider: false });
  }
  const mediaType = normalizeImageMediaType(part.mimeType ?? res.headers.get("content-type") ?? "image/jpeg");
  return { data: Buffer.from(buffer).toString("base64"), mediaType };
}
