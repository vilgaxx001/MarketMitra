/**
 * src/modules/ai/memory/http.ts
 *
 * Memory routes use the shared bounded JSON reader (src/lib/bounded-json.ts, moved there in
 * Module 5B.5 so the preferences and execute routes get the same guarantees) with a 16 KiB
 * default limit. The reader's behaviour and limits of guarantee are documented in that file.
 */
import { readBoundedJson as readBoundedJsonWithLimit } from "@/lib/bounded-json";
export type { BoundedJsonResult } from "@/lib/bounded-json";

export const MAX_MEMORY_REQUEST_BYTES = 16_384;

export function readBoundedJson(req: Request, maxBytes: number = MAX_MEMORY_REQUEST_BYTES) {
  return readBoundedJsonWithLimit(req, maxBytes);
}
