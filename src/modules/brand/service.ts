/**
 * src/modules/brand/service.ts
 */
import { ApiException } from "@/lib/api-response";
import { logActivity } from "@/modules/activity/service";
import * as businessRepo from "@/modules/business/repository";
import { resolveDownloadUrl } from "@/modules/assets/storage";
import * as repo from "./repository";
import type { UpdateBrandIdentityInput } from "./validators";
import type { BrandIdentityDTO } from "./types";

async function toDTO(brand: NonNullable<Awaited<ReturnType<typeof repo.findByBusinessId>>>): Promise<BrandIdentityDTO> {
  return {
    id: brand.id,
    businessId: brand.businessId,
    brandName: brand.brandName,
    logoAssetId: brand.logoAssetId,
    logoUrl: brand.logoAsset?.currentVersion ? await resolveDownloadUrl(brand.logoAsset.currentVersion.storageKey) : null,
    primaryColor: brand.primaryColor,
    secondaryColor: brand.secondaryColor,
    accentColor: brand.accentColor,
    typographyPreference: brand.typographyPreference,
    personality: brand.personality,
    tone: brand.tone,
    toneOfVoice: brand.toneOfVoice,
    wordsToUse: brand.wordsToUse,
    wordsToAvoid: brand.wordsToAvoid,
    brandValues: brand.brandValues,
    mission: brand.mission,
    positioning: brand.positioning,
    tagline: brand.tagline,
    communicationStyle: brand.communicationStyle,
    createdAt: brand.createdAt,
    updatedAt: brand.updatedAt,
  };
}

export async function getBrandIdentity(businessId: string, workspaceId: string): Promise<BrandIdentityDTO | null> {
  const business = await businessRepo.findByIdInWorkspace(businessId, workspaceId);
  if (!business) throw new ApiException("NOT_FOUND", "Business not found.");

  const brand = await repo.findByBusinessId(businessId);
  return brand ? toDTO(brand) : null;
}

export async function updateBrandIdentity(
  businessId: string,
  workspaceId: string,
  actorId: string,
  input: UpdateBrandIdentityInput
): Promise<BrandIdentityDTO> {
  const business = await businessRepo.findByIdInWorkspace(businessId, workspaceId);
  if (!business) throw new ApiException("NOT_FOUND", "Business not found.");

  const brand = await repo.upsert(businessId, {
    ...(input.brandName !== undefined && { brandName: input.brandName || null }),
    ...(input.primaryColor !== undefined && { primaryColor: input.primaryColor || null }),
    ...(input.secondaryColor !== undefined && { secondaryColor: input.secondaryColor || null }),
    ...(input.accentColor !== undefined && { accentColor: input.accentColor || null }),
    ...(input.typographyPreference !== undefined && { typographyPreference: input.typographyPreference || null }),
    ...(input.personality !== undefined && { personality: input.personality }),
    ...(input.tone !== undefined && { tone: input.tone || null }),
    ...(input.toneOfVoice !== undefined && { toneOfVoice: input.toneOfVoice || null }),
    ...(input.wordsToUse !== undefined && { wordsToUse: input.wordsToUse }),
    ...(input.wordsToAvoid !== undefined && { wordsToAvoid: input.wordsToAvoid }),
    ...(input.brandValues !== undefined && { brandValues: input.brandValues }),
    ...(input.mission !== undefined && { mission: input.mission || null }),
    ...(input.positioning !== undefined && { positioning: input.positioning || null }),
    ...(input.tagline !== undefined && { tagline: input.tagline || null }),
    ...(input.communicationStyle !== undefined && { communicationStyle: input.communicationStyle || null }),
  }, input.logoAssetId);

  await logActivity({
    workspaceId,
    actorId,
    action: "brand.updated",
    targetType: "brand_identity",
    targetId: brand.id,
    metadata: { businessId, fields: Object.keys(input) },
  });

  return toDTO(brand);
}
