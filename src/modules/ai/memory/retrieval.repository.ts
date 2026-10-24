/**
 * src/modules/ai/memory/retrieval.repository.ts
 *
 * Read-only candidate query for retrieval. Every row is selected under
 * `businessId` in the same WHERE (no cross-business fetch-then-filter), and
 * "usable" is evaluated in the database exactly as the CRUD list's `active`
 * view defines it: ACTIVE and (no expiry or expiry in the future). The query
 * is served by the existing (businessId, status, createdAt) index, selects
 * only the columns retrieval returns, and is bounded by `limit`.
 */
import { db } from "@/lib/db";
import type { BusinessMemoryTypeValue } from "./types";

/** Exactly the columns selected below; the explicit type keeps callers type-safe independent of Prisma client generation. */
export interface RetrievalRow {
  id: string;
  type: BusinessMemoryTypeValue;
  label: string | null;
  content: string;
  expiresAt: Date | null;
  createdAt: Date;
}

export async function findRetrievalCandidates(businessId: string, opts: { types?: readonly BusinessMemoryTypeValue[]; now: Date; limit: number }): Promise<RetrievalRow[]> {
  return db.businessMemory.findMany({
    where: {
      businessId,
      status: "ACTIVE",
      OR: [{ expiresAt: null }, { expiresAt: { gt: opts.now } }],
      ...(opts.types ? { type: { in: [...opts.types] } } : {}),
    },
    select: { id: true, type: true, label: true, content: true, expiresAt: true, createdAt: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: opts.limit,
  });
}
