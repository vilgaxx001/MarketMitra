/**
 * src/modules/business/service.ts
 */
import { db } from "@/lib/db";
import { ApiException } from "@/lib/api-response";
import { slugify } from "@/lib/utils";
import { logActivity } from "@/modules/activity/service";
import { computeProfileCompletionScore } from "./completion-score";
import * as repo from "./repository";
import type { CreateBusinessInput, UpdateBusinessInput } from "./validators";
import type { BusinessProfileDTO, BusinessSummary } from "./types";
import type { BusinessProfile } from "@prisma/client";

/** No Module 8 billing/subscription exists for most workspaces yet — this is the documented fallback until every workspace has a real Subscription row. */
const DEFAULT_MAX_BUSINESSES_NO_SUBSCRIPTION = 1;

async function getBusinessLimit(workspaceId: string): Promise<number> {
  const subscription = await db.subscription.findUnique({
    where: { workspaceId },
    include: { plan: true },
  });
  return subscription?.plan.maxBusinesses ?? DEFAULT_MAX_BUSINESSES_NO_SUBSCRIPTION;
}

function toDTO(b: BusinessProfile, completionScore: number): BusinessProfileDTO {
  return {
    id: b.id,
    workspaceId: b.workspaceId,
    slug: b.slug,
    businessName: b.businessName,
    description: b.description,
    industry: b.industry,
    category: b.category,
    businessType: b.businessType,
    website: b.website,
    country: b.country,
    state: b.state,
    city: b.city,
    timeZone: b.timeZone,
    preferredLanguage: b.preferredLanguage,
    currency: b.currency,
    targetMarket: b.targetMarket,
    businessGoals: b.businessGoals,
    primaryOfferings: b.primaryOfferings,
    usp: b.usp,
    marketingChallenges: b.marketingChallenges,
    competitors: b.competitors,
    socialLinks: (b.socialLinks as Record<string, string> | null) ?? null,
    isActive: b.isActive,
    archivedAt: b.archivedAt,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
    profileCompletionScore: completionScore,
  };
}

async function generateUniqueSlug(workspaceId: string, name: string): Promise<string> {
  const base = slugify(name) || "business";
  let candidate = base;
  let attempt = 0;
  while (await repo.slugExists(workspaceId, candidate)) {
    attempt += 1;
    candidate = `${base}-${Math.random().toString(36).slice(2, 6)}`;
    if (attempt > 10) {
      throw new ApiException("INTERNAL_ERROR", "Could not generate a unique business URL. Please try a different name.");
    }
  }
  return candidate;
}

/** Loads the completion score for a single business (used by getBusiness / after create/update). */
async function scoreFor(businessId: string): Promise<number> {
  const [brand, audienceCount] = await Promise.all([
    db.brandIdentity.findUnique({ where: { businessId } }),
    db.audienceSegment.count({ where: { businessId, isActive: true } }),
  ]);
  const business = await repo.findById(businessId);
  if (!business) return 0;
  return computeProfileCompletionScore({ business, brand, audienceSegmentCount: audienceCount });
}

export async function createBusiness(
  workspaceId: string,
  actorId: string,
  input: CreateBusinessInput
): Promise<BusinessProfileDTO> {
  const [limit, currentCount] = await Promise.all([
    getBusinessLimit(workspaceId),
    repo.countActive(workspaceId),
  ]);

  if (currentCount >= limit) {
    throw new ApiException(
      "PLAN_LIMIT_REACHED",
      `Your plan allows up to ${limit} active business${limit === 1 ? "" : "es"}. Archive one or upgrade your plan to add another.`,
      { limit, currentCount }
    );
  }

  const slug = await generateUniqueSlug(workspaceId, input.businessName);

  const business = await repo.create({
    workspaceId,
    slug,
    businessName: input.businessName,
    createdById: actorId,
    description: input.description || null,
    industry: input.industry || null,
    category: input.category || null,
    businessType: input.businessType,
    website: input.website || null,
  });

  await logActivity({
    workspaceId,
    actorId,
    action: "business.created",
    targetType: "business",
    targetId: business.id,
    metadata: { businessId: business.id, businessName: business.businessName },
  });

  return toDTO(business, await scoreFor(business.id));
}

export async function getBusiness(businessId: string, workspaceId: string): Promise<BusinessProfileDTO> {
  const business = await repo.findByIdInWorkspace(businessId, workspaceId);
  if (!business) {
    throw new ApiException("NOT_FOUND", "Business not found.");
  }
  return toDTO(business, await scoreFor(business.id));
}

export async function listBusinesses(workspaceId: string, includeArchived = false): Promise<BusinessSummary[]> {
  const businesses = await repo.listByWorkspace(workspaceId, includeArchived);
  return businesses.map((b) => ({
    id: b.id,
    slug: b.slug,
    businessName: b.businessName,
    industry: b.industry,
    isActive: b.isActive,
  }));
}

export async function updateBusiness(
  businessId: string,
  workspaceId: string,
  actorId: string,
  input: UpdateBusinessInput
): Promise<BusinessProfileDTO> {
  const existing = await repo.findByIdInWorkspace(businessId, workspaceId);
  if (!existing) {
    throw new ApiException("NOT_FOUND", "Business not found.");
  }

  // Explicit field-by-field mapping — never spread the raw client input into
  // Prisma's update payload (mass-assignment guard, per the Module 4 brief).
  const business = await repo.update(businessId, {
    ...(input.businessName !== undefined && { businessName: input.businessName }),
    ...(input.description !== undefined && { description: input.description || null }),
    ...(input.industry !== undefined && { industry: input.industry || null }),
    ...(input.category !== undefined && { category: input.category || null }),
    ...(input.businessType !== undefined && { businessType: input.businessType }),
    ...(input.website !== undefined && { website: input.website || null }),
    ...(input.country !== undefined && { country: input.country || null }),
    ...(input.state !== undefined && { state: input.state || null }),
    ...(input.city !== undefined && { city: input.city || null }),
    ...(input.timeZone !== undefined && { timeZone: input.timeZone || null }),
    ...(input.preferredLanguage !== undefined && { preferredLanguage: input.preferredLanguage || null }),
    ...(input.currency !== undefined && { currency: input.currency || null }),
    ...(input.targetMarket !== undefined && { targetMarket: input.targetMarket || null }),
    ...(input.businessGoals !== undefined && { businessGoals: input.businessGoals }),
    ...(input.primaryOfferings !== undefined && { primaryOfferings: input.primaryOfferings }),
    ...(input.usp !== undefined && { usp: input.usp || null }),
    ...(input.marketingChallenges !== undefined && { marketingChallenges: input.marketingChallenges }),
    ...(input.competitors !== undefined && { competitors: input.competitors }),
    ...(input.socialLinks !== undefined && { socialLinks: input.socialLinks }),
  });

  await logActivity({
    workspaceId,
    actorId,
    action: "business.updated",
    targetType: "business",
    targetId: businessId,
    metadata: { businessId, fields: Object.keys(input) },
  });

  return toDTO(business, await scoreFor(business.id));
}

export async function archiveBusiness(businessId: string, workspaceId: string, actorId: string): Promise<BusinessProfileDTO> {
  const existing = await repo.findByIdInWorkspace(businessId, workspaceId);
  if (!existing) throw new ApiException("NOT_FOUND", "Business not found.");

  const business = await repo.archive(businessId);

  await logActivity({
    workspaceId,
    actorId,
    action: "business.archived",
    targetType: "business",
    targetId: businessId,
    metadata: { businessId },
  });

  return toDTO(business, await scoreFor(business.id));
}

export async function restoreBusiness(businessId: string, workspaceId: string, actorId: string): Promise<BusinessProfileDTO> {
  const existing = await repo.findByIdInWorkspace(businessId, workspaceId);
  if (!existing) throw new ApiException("NOT_FOUND", "Business not found.");

  const [limit, currentCount] = await Promise.all([
    getBusinessLimit(workspaceId),
    repo.countActive(workspaceId),
  ]);
  if (currentCount >= limit) {
    throw new ApiException(
      "PLAN_LIMIT_REACHED",
      `Restoring this business would exceed your plan's limit of ${limit} active business${limit === 1 ? "" : "es"}.`,
      { limit, currentCount }
    );
  }

  const business = await repo.restore(businessId);

  await logActivity({
    workspaceId,
    actorId,
    action: "business.restored",
    targetType: "business",
    targetId: businessId,
    metadata: { businessId },
  });

  return toDTO(business, await scoreFor(business.id));
}
