/**
 * src/modules/ai/memory/repository.ts
 *
 * Persistence only. OWNERSHIP IS ENFORCED HERE: every read/write that
 * targets a record carries `businessId` in the same query's WHERE clause,
 * so a memory id from another business simply matches nothing (no
 * fetch-then-check, no way to learn that it exists). `businessId` is never
 * part of an update's data. Callers (service.ts) additionally verify the
 * business belongs to the authorized workspace.
 */
import { db } from "@/lib/db";
import type {
  BusinessMemoryStatusValue, BusinessMemoryTypeValue, MemoryListView, MemoryMetadata,
} from "./types";

export interface MemoryCreateData {
  type: BusinessMemoryTypeValue;
  content: string;
  label: string | null;
  metadata: MemoryMetadata;
  expiresAt: Date | null;
}
export interface MemoryUpdateData {
  type?: BusinessMemoryTypeValue;
  content?: string;
  label?: string | null;
  metadata?: MemoryMetadata;
  expiresAt?: Date | null;
}

export async function findByIdInBusiness(id: string, businessId: string) {
  return db.businessMemory.findFirst({ where: { id, businessId } });
}

export async function countByBusiness(businessId: string): Promise<number> {
  return db.businessMemory.count({ where: { businessId } });
}

function listWhere(businessId: string, view: MemoryListView, type: BusinessMemoryTypeValue | undefined, now: Date) {
  return {
    businessId,
    ...(type ? { type } : {}),
    ...(view === "active"
      ? { status: "ACTIVE" as const, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }
      : view === "archived"
        ? { status: "ARCHIVED" as const }
        : {}),
  };
}

/** One page + total in two queries (no per-row follow-up queries). Newest first, id as tiebreaker. */
export async function list(businessId: string, opts: { view: MemoryListView; type?: BusinessMemoryTypeValue; limit: number; offset: number; now: Date }) {
  const where = listWhere(businessId, opts.view, opts.type, opts.now);
  const [rows, totalCount] = await Promise.all([
    db.businessMemory.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: opts.limit, skip: opts.offset }),
    db.businessMemory.count({ where }),
  ]);
  return { rows, totalCount };
}

export async function create(businessId: string, actorId: string, data: MemoryCreateData) {
  return db.businessMemory.create({
    data: {
      business: { connect: { id: businessId } },
      createdBy: { connect: { id: actorId } },
      updatedBy: { connect: { id: actorId } },
      ...data,
    },
  });
}

/**
 * Update only an ACTIVE record owned by this business. Returns true if a
 * row was changed. The status condition makes "edit an archived memory"
 * fail atomically even if the record was archived a moment ago.
 */
export async function updateActiveInBusiness(id: string, businessId: string, actorId: string, data: MemoryUpdateData): Promise<boolean> {
  const result = await db.businessMemory.updateMany({
    where: { id, businessId, status: "ACTIVE" },
    data: { ...data, updatedById: actorId, updatedAt: new Date() },
  });
  return result.count > 0;
}

/** Atomic status transition from -> to, scoped to the business. Returns true if a row was changed. */
export async function transitionStatus(id: string, businessId: string, actorId: string, from: BusinessMemoryStatusValue, to: BusinessMemoryStatusValue): Promise<boolean> {
  const result = await db.businessMemory.updateMany({
    where: { id, businessId, status: from },
    data: { status: to, updatedById: actorId, updatedAt: new Date() },
  });
  return result.count > 0;
}

/** Hard delete scoped to the business. Returns true if a row was deleted. */
export async function deleteInBusiness(id: string, businessId: string): Promise<boolean> {
  const result = await db.businessMemory.deleteMany({ where: { id, businessId } });
  return result.count > 0;
}
