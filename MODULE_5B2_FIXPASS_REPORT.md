# Module 5B.2 Fix Pass — Genuine Request-Body Limit

Classification: VERIFIED / FAILED / ENVIRONMENT-UNVERIFIED / DEFERRED. No approval is claimed.

## Defect (confirmed)
`readBoundedJson()` called `req.text()` (buffering the whole body) before checking size, compared JavaScript string length rather than bytes, and trusted only an honest Content-Length. A multi-megabyte streamed body, or one with a missing/understated header, was fully buffered; 6,000 "€" (18,000 bytes, 6,000 characters) passed the check.

## Fix — VERIFIED
`src/modules/ai/memory/http.ts` now reads `req.body` chunk by chunk, sums actual `byteLength`, and on the first chunk that crosses 16,384 bytes cancels the stream and returns the existing `VALIDATION_ERROR` 400 ("The request body is too large."). Content-Length is only an early-reject hint (overstated → rejected without reading; missing, understated or garbage → ignored, bytes are counted). Bytes are decoded once with a fatal UTF-8 decoder. Missing body, invalid UTF-8, malformed JSON and stream errors all return the same safe 400 envelope (error details are not leaked). No new dependency; signature, return type and envelope are unchanged (optional `maxBytes` parameter added, default 16,384).
Routes: the only memory routes that read a body are `POST …/ai-memories` and `PATCH …/ai-memories/{id}`; both use the bounded reader (a route test streams an oversized body to each). The archive/restore POST routes never read the request body, so they buffer nothing.

## Files changed (exactly)
- `src/modules/ai/memory/http.ts` — rewritten reader
- `src/modules/ai/memory/__tests__/http.test.ts` — new (15 tests)
- `src/modules/ai/memory/__tests__/routes.test.ts` — +1 test (both routes, streamed multibyte oversize, no Content-Length)
- `docs/AI_MEMORY.md` — one sentence on the byte limit and its scope
- `MODULE_5B2_FIXPASS_REPORT.md` — this report
No change to ownership, permissions, schema, migrations, AI Core or the execution contract.

## Tests — VERIFIED
New tests cover: below limit accepted; exactly 16,384 bytes accepted; +1 byte rejected; multibyte measured in bytes (also exact-limit multibyte and a character split across chunks); missing / understated / overstated / garbage Content-Length; a 10,000-chunk (~10 MB) stream is cancelled after fewer than 25 pulls, and 16,385 one-byte chunks are summed; malformed JSON, empty/missing body, invalid UTF-8 and a throwing stream give safe 400s without leaking the error. They are deterministic in-memory `ReadableStream` tests.
**Mutation check:** running the new tests against the previous `http.ts` makes 6 fail (multibyte, overstated header not skipping the read, early cut-off, many-chunk sum, stream error, and the route test), so the tests detect the original defect.
Full regression (single-fork flags): **30 files, 273/273 passed** (was 257; +16), including all 5A, 5B.1 and the existing memory route/authorization/validation tests. `npx tsc --noEmit`: only the known Prisma-client cascade. `npx eslint . --ext .ts,.tsx`: exit 0.

## Limitations
- These tests prove this handler's own byte accounting and early stop. They do **not** prove hosting-platform, CDN, proxy or Next.js server request-size limits, which are not configured or tested here (ENVIRONMENT-UNVERIFIED).
- "At most one chunk beyond the limit is held" assumes the runtime delivers bounded chunks; a single huge chunk already delivered by the runtime is counted but cannot be un-buffered by this code.
- Unchanged from the 5B.2 report: Prisma validate/generate and `next build` not run, migrations unapplied, no real-database test, Modules 1–4 migration baseline absent.
5B.3 not started.
