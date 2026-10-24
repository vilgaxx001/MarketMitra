/**
 * src/modules/ai/memory/service.ts
 *
 * Business Memory service (Module 5B.2): validated, authorized CRUD only.
 * No extraction, retrieval, prompt injection, embeddings or background work.
 *
 * Every entry point first re-verifies that `businessId` belongs to the
 * caller's already-authorized workspace (IDOR guard); every record-level
 * operation then scopes by businessId in the repository query. A memory id
 * that is missing OR belongs to another business yields the same
 * NOT_FOUND ("Memory not found."), so existence is never revealed.
 *
 * Audit entries record ids and field NAMES only — never memory content,
 * label or metadata values.
 */
import { ApiException } from "@/lib/api-response";
import { logActivity } from "@/modules/activity/service";
import * as businessRepo from "@/modules/business/repository";
import * as repo from "./repository";
import { MEMORY_LIMITS } from "./types";
import type {
  BusinessMemoryDTO, BusinessMemoryListResult, BusinessMemoryStatusValue, BusinessMemoryTypeValue, MemoryMetadata,
} from "./types";
import type { CreateBusinessMemoryInput, UpdateBusinessMemoryInput, ListBusinessMemoriesQuery } from "./validators";

type Row = NonNullable<Awaited<ReturnType<typeof repo.findByIdInBusiness>>>;

function toDTO(row: Row, now: Date): BusinessMemoryDTO {
  return {
    id: row.id,
    businessId: row.businessId,
    type: row.type as BusinessMemoryTypeValue,
    status: row.status as BusinessMemoryStatusValue,
    label: row.label,
    content: row.content,
    metadata: (row.metadata ?? {}) as MemoryMetadata,
    expiresAt: row.expiresAt,
    isExpired: row.expiresAt !== null && row.expiresAt.getTime() <= now.getTime(),
    createdById: row.createdById,
    updatedById: row.updatedById,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const notFound = () => new ApiException("NOT_FOUND", "Memory not found.");

async function assertBusinessInWorkspace(businessId: string, workspaceId: string): Promise<void> {
  const business = await businessRepo.findByIdInWorkspace(businessId, workspaceId);
  if (!business) throw new ApiException("NOT_FOUND", "Business not found.");
}

export async function createBusinessMemory(businessId: string, workspaceId: string, actorId: string, input: CreateBusinessMemoryInput): Promise<BusinessMemoryDTO> {
  await assertBusinessInWorkspace(businessId, workspaceId);
  // Soft cap: the count and the insert are not one atomic step, so concurrent creates can exceed it slightly.
  if ((await repo.countByBusiness(businessId)) >= MEMORY_LIMITS.maxMemoriesPerBusiness) {
    throw new ApiException("CONFLICT", `This business has reached the limit of ${MEMORY_LIMITS.maxMemoriesPerBusiness} memories. Delete or archive-and-delete some first.`);
  }
  const row = await repo.create(businessId, actorId, {
    type: input.type,
    content: input.content,
    label: input.label ? input.label : null,
    metadata: input.metadata ?? {},
    expiresAt: input.expiresAt ?? null,
  });
  await logActivity({ workspaceId, actorId, action: "ai_memory.created", targetType: "ai_memory", targetId: row.id, metadata: { businessId, memoryId: row.id, type: input.type } });
  return toDTO(row, new Date());
}

export async function listBusinessMemories(businessId: string, workspaceId: string, query: ListBusinessMemoriesQuery): Promise<BusinessMemoryListResult> {
  await assertBusinessInWorkspace(businessId, workspaceId);
  const now = new Date();
  const { rows, totalCount } = await repo.list(businessId, { view: query.view, type: query.type, limit: query.limit, offset: query.offset, now });
  return { items: rows.map((r) => toDTO(r, now)), totalCount, limit: query.limit, offset: query.offset };
}

export async function getBusinessMemory(memoryId: string, businessId: string, workspaceId: string): Promise<BusinessMemoryDTO> {
  await assertBusinessInWorkspace(businessId, workspaceId);
  const row = await repo.findByIdInBusiness(memoryId, businessId);
  if (!row) throw notFound();
  return toDTO(row, new Date());
}

export async function updateBusinessMemory(memoryId: string, businessId: string, workspaceId: string, actorId: string, input: UpdateBusinessMemoryInput): Promise<BusinessMemoryDTO> {
  await assertBusinessInWorkspace(businessId, workspaceId);
  const changed = await repo.updateActiveInBusiness(memoryId, businessId, actorId, {
    ...(input.type !== undefined && { type: input.type }),
    ...(input.content !== undefined && { content: input.content }),
    ...(input.label !== undefined && { label: input.label ? input.label : null }),
    ...(input.metadata !== undefined && { metadata: input.metadata ?? {} }),
    ...(input.expiresAt !== undefined && { expiresAt: input.expiresAt }),
  });
  if (!changed) {
    // Either it is not this business's memory (NOT_FOUND) or it is archived (read-only).
    const existing = await repo.findByIdInBusiness(memoryId, businessId);
    if (!existing) throw notFound();
    throw new ApiException("CONFLICT", "Archived memories are read-only. Restore the memory before editing it.");
  }
  const row = await repo.findByIdInBusiness(memoryId, businessId);
  if (!row) throw notFound();
  await logActivity({ workspaceId, actorId, action: "ai_memory.updated", targetType: "ai_memory", targetId: memoryId, metadata: { businessId, memoryId, fields: Object.keys(input) } });
  return toDTO(row, new Date());
}

async function transition(
  memoryId: string, businessId: string, workspaceId: string, actorId: string,
  from: BusinessMemoryStatusValue, to: BusinessMemoryStatusValue, action: "ai_memory.archived" | "ai_memory.restored"
): Promise<BusinessMemoryDTO> {
  await assertBusinessInWorkspace(businessId, workspaceId);
  const changed = await repo.transitionStatus(memoryId, businessId, actorId, from, to);
  const row = await repo.findByIdInBusiness(memoryId, businessId);
  if (!row) throw notFound();
  // Already in the target state: idempotent success, no audit entry.
  if (changed) await logActivity({ workspaceId, actorId, action, targetType: "ai_memory", targetId: memoryId, metadata: { businessId, memoryId } });
  return toDTO(row, new Date());
}

/** Reversible removal from active use. */
export function archiveBusinessMemory(memoryId: string, businessId: string, workspaceId: string, actorId: string) {
  return transition(memoryId, businessId, workspaceId, actorId, "ACTIVE", "ARCHIVED", "ai_memory.archived");
}
/** ARCHIVED -> ACTIVE. Does not extend an elapsed expiresAt (edit it to re-activate an expired memory). */
export function restoreBusinessMemory(memoryId: string, businessId: string, workspaceId: string, actorId: string) {
  return transition(memoryId, businessId, workspaceId, actorId, "ARCHIVED", "ACTIVE", "ai_memory.restored");
}

/** Permanent hard delete (any status). */
export async function deleteBusinessMemory(memoryId: string, businessId: string, workspaceId: string, actorId: string): Promise<void> {
  await assertBusinessInWorkspace(businessId, workspaceId);
  const deleted = await repo.deleteInBusiness(memoryId, businessId);
  if (!deleted) throw notFound();
  await logActivity({ workspaceId, actorId, action: "ai_memory.deleted", targetType: "ai_memory", targetId: memoryId, metadata: { businessId, memoryId } });
}
