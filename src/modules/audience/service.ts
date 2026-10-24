/**
 * src/modules/audience/service.ts
 */
import { ApiException } from "@/lib/api-response";
import { logActivity } from "@/modules/activity/service";
import * as businessRepo from "@/modules/business/repository";
import * as repo from "./repository";
import type { AudienceSegmentInput, UpdateAudienceSegmentInput } from "./validators";
import type { AudienceSegmentDTO } from "./types";
import type { AudienceSegment } from "@prisma/client";

function toDTO(s: AudienceSegment): AudienceSegmentDTO {
  return {
    id: s.id,
    businessId: s.businessId,
    name: s.name,
    description: s.description,
    ageRange: s.ageRange,
    location: s.location,
    language: s.language,
    interests: s.interests,
    painPoints: s.painPoints,
    needs: s.needs,
    buyingMotivations: s.buyingMotivations,
    objections: s.objections,
    preferredPlatforms: s.preferredPlatforms,
    contentPreferences: s.contentPreferences,
    customerType: s.customerType,
    notes: s.notes,
    isPrimary: s.isPrimary,
    isActive: s.isActive,
    archivedAt: s.archivedAt,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

async function assertBusinessInWorkspace(businessId: string, workspaceId: string): Promise<void> {
  const business = await businessRepo.findByIdInWorkspace(businessId, workspaceId);
  if (!business) throw new ApiException("NOT_FOUND", "Business not found.");
}

export async function listSegments(businessId: string, workspaceId: string, includeArchived = false): Promise<AudienceSegmentDTO[]> {
  await assertBusinessInWorkspace(businessId, workspaceId);
  const segments = await repo.listByBusiness(businessId, includeArchived);
  return segments.map(toDTO);
}

export async function createSegment(
  businessId: string,
  workspaceId: string,
  actorId: string,
  input: AudienceSegmentInput
): Promise<AudienceSegmentDTO> {
  await assertBusinessInWorkspace(businessId, workspaceId);

  const segment = await repo.create(businessId, actorId, {
    name: input.name,
    description: input.description || null,
    ageRange: input.ageRange || null,
    location: input.location || null,
    language: input.language || null,
    interests: input.interests ?? [],
    painPoints: input.painPoints ?? [],
    needs: input.needs ?? [],
    buyingMotivations: input.buyingMotivations ?? [],
    objections: input.objections ?? [],
    preferredPlatforms: input.preferredPlatforms ?? [],
    contentPreferences: input.contentPreferences ?? [],
    customerType: input.customerType || null,
    notes: input.notes || null,
  });

  await logActivity({
    workspaceId,
    actorId,
    action: "audience.created",
    targetType: "audience_segment",
    targetId: segment.id,
    metadata: { businessId, segmentId: segment.id, name: segment.name },
  });

  return toDTO(segment);
}

export async function updateSegment(
  segmentId: string,
  businessId: string,
  workspaceId: string,
  actorId: string,
  input: UpdateAudienceSegmentInput
): Promise<AudienceSegmentDTO> {
  await assertBusinessInWorkspace(businessId, workspaceId);
  const existing = await repo.findByIdInBusiness(segmentId, businessId);
  if (!existing) throw new ApiException("NOT_FOUND", "Audience segment not found.");

  const segment = await repo.update(segmentId, {
    ...(input.name !== undefined && { name: input.name }),
    ...(input.description !== undefined && { description: input.description || null }),
    ...(input.ageRange !== undefined && { ageRange: input.ageRange || null }),
    ...(input.location !== undefined && { location: input.location || null }),
    ...(input.language !== undefined && { language: input.language || null }),
    ...(input.interests !== undefined && { interests: input.interests }),
    ...(input.painPoints !== undefined && { painPoints: input.painPoints }),
    ...(input.needs !== undefined && { needs: input.needs }),
    ...(input.buyingMotivations !== undefined && { buyingMotivations: input.buyingMotivations }),
    ...(input.objections !== undefined && { objections: input.objections }),
    ...(input.preferredPlatforms !== undefined && { preferredPlatforms: input.preferredPlatforms }),
    ...(input.contentPreferences !== undefined && { contentPreferences: input.contentPreferences }),
    ...(input.customerType !== undefined && { customerType: input.customerType || null }),
    ...(input.notes !== undefined && { notes: input.notes || null }),
  });

  await logActivity({
    workspaceId,
    actorId,
    action: "audience.updated",
    targetType: "audience_segment",
    targetId: segmentId,
    metadata: { businessId, segmentId, fields: Object.keys(input) },
  });

  return toDTO(segment);
}

export async function archiveSegment(segmentId: string, businessId: string, workspaceId: string, actorId: string): Promise<void> {
  await assertBusinessInWorkspace(businessId, workspaceId);
  const existing = await repo.findByIdInBusiness(segmentId, businessId);
  if (!existing) throw new ApiException("NOT_FOUND", "Audience segment not found.");

  await repo.archive(segmentId);

  await logActivity({
    workspaceId,
    actorId,
    action: "audience.archived",
    targetType: "audience_segment",
    targetId: segmentId,
    metadata: { businessId, segmentId },
  });
}

export async function setPrimarySegment(
  segmentId: string,
  businessId: string,
  workspaceId: string,
  actorId: string
): Promise<AudienceSegmentDTO> {
  await assertBusinessInWorkspace(businessId, workspaceId);
  const existing = await repo.findByIdInBusiness(segmentId, businessId);
  if (!existing) throw new ApiException("NOT_FOUND", "Audience segment not found.");
  if (!existing.isActive) {
    throw new ApiException("CONFLICT", "An archived segment can't be set as primary. Restore it first.");
  }

  const segment = await repo.setPrimary(businessId, segmentId);

  await logActivity({
    workspaceId,
    actorId,
    action: "audience.primary_changed",
    targetType: "audience_segment",
    targetId: segmentId,
    metadata: { businessId, segmentId },
  });

  return toDTO(segment);
}
