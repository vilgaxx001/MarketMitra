/**
 * src/modules/assets/mime-sniff.ts
 *
 * Verifies a file's real type from its magic bytes rather than trusting
 * the client-declared Content-Type/mimeType field — a client can claim
 * anything in that field, so it's a hint for the presigned-upload step
 * only. The confirm-upload step (assets/service.ts) reads the first few
 * bytes of the actually-uploaded S3 object and checks them here before
 * persisting the FileAssetVersion row.
 *
 * Text-based formats (CSV) have no reliable magic-byte signature, so
 * they fall back to trusting the declared type — documented, not hidden.
 */

const SIGNATURES: { mimeType: string; bytes: number[] }[] = [
  { mimeType: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mimeType: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { mimeType: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46] }, // "%PDF"
  // .docx / .xlsx are ZIP containers (Office Open XML) — same signature for both;
  // the declared mimeType (already restricted to those two by the category
  // allowlist) disambiguates which one it's supposed to be.
  { mimeType: "application/zip", bytes: [0x50, 0x4b, 0x03, 0x04] },
];

const ZIP_BASED_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const NO_MAGIC_BYTES_MIME_TYPES = new Set(["text/csv", "image/svg+xml"]);

function matchesSignature(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((byte, i) => bytes[i] === byte);
}

/**
 * Returns true if `headBytes` is consistent with `declaredMimeType`.
 * Deliberately permissive rather than exact-matching for ZIP-based
 * Office formats and SVG/CSV (documented above) — the goal is catching
 * "this is actually an .exe renamed to .png," not byte-perfect format
 * validation.
 */
export function verifyMimeTypeMatchesContent(headBytes: Uint8Array, declaredMimeType: string): boolean {
  if (NO_MAGIC_BYTES_MIME_TYPES.has(declaredMimeType)) return true;

  if (ZIP_BASED_MIME_TYPES.has(declaredMimeType)) {
    return matchesSignature(headBytes, [0x50, 0x4b, 0x03, 0x04]);
  }

  const expected = SIGNATURES.find((s) => s.mimeType === declaredMimeType);
  if (!expected) return false; // unknown declared type — never allow-list by default
  return matchesSignature(headBytes, expected.bytes);
}
