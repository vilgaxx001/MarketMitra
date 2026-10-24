/**
 * src/modules/context/service.ts
 *
 * THE BUSINESS CONTEXT ENGINE.
 *
 * This is NOT Module 5 AI Memory — no embeddings, no vector search, no
 * conversation state. It aggregates trusted, structured Module 4 data
 * (business profile, brand identity, audience segments, asset metadata)
 * into the stable `BusinessContext` shape defined in
 * src/types/business-context.ts, which Module 5 will import and consume
 * directly. This file never imports an AI SDK and never will — see
 * docs/BUSINESS_CONTEXT_ENGINE.md for the full contract documentation.
 *
 * SECURITY: `resolveBusinessContext` takes an already-authorized
 * `WorkspaceUser` (resolved by requireWorkspaceAccess — see
 * require-auth.ts) and a businessId, and re-verifies the business
 * belongs to that workspace via `requireBusinessAccess` before touching
 * any data. There is no code path here that resolves context from a
 * bare businessId without a workspace-membership check first.
 */
import { requireBusinessAccess } from "@/lib/middleware/require-business";
import { resolveDownloadUrl } from "@/modules/assets/storage";
import { computeProfileCompletionScore } from "@/modules/business/completion-score";
import * as businessRepo from "@/modules/business/repository";
import { ApiException } from "@/lib/api-response";
import type { WorkspaceUser } from "@/modules/auth/types";
import type { BusinessContext, AudienceSegmentContext, BrandAssetMetadata } from "@/types/business-context";

export async function resolveBusinessContext(
  workspaceUser: WorkspaceUser,
  businessId: string
): Promise<BusinessContext> {
  // Re-validates workspace ownership — never trust the caller already did this correctly.
  await requireBusinessAccess(workspaceUser, businessId);

  const full = await businessRepo.findFullContext(businessId);
  if (!full || !full.isActive) {
    throw new ApiException("NOT_FOUND", "Business not found or archived.");
  }

  const audienceSegments: AudienceSegmentContext[] = full.audienceSegments.map((seg) => ({
    id: seg.id,
    name: seg.name,
    description: seg.description,
    ageRange: seg.ageRange,
    location: seg.location,
    language: seg.language,
    interests: seg.interests,
    painPoints: seg.painPoints,
    needs: seg.needs,
    buyingMotivations: seg.buyingMotivations,
    objections: seg.objections,
    preferredPlatforms: seg.preferredPlatforms,
    contentPreferences: seg.contentPreferences,
    customerType: seg.customerType,
    isPrimary: seg.isPrimary,
  }));
  const primaryAudience = audienceSegments.find((a) => a.isPrimary) ?? null;

  const brandAssets: BrandAssetMetadata[] = full.fileAssets
    .filter((a) => a.currentVersion !== null)
    .map((a) => ({
      id: a.id,
      category: a.category,
      name: a.name,
      mimeType: a.currentVersion!.mimeType,
      sizeBytes: a.currentVersion!.sizeBytes,
      currentVersionId: a.currentVersionId,
    }));

  const completionScore = computeProfileCompletionScore({
    business: full,
    brand: full.brandIdentity,
    audienceSegmentCount: full.audienceSegments.length,
  });

  return {
    workspace: {
      id: full.workspace.id,
      name: full.workspace.name,
      slug: full.workspace.slug,
    },
    business: {
      id: full.id,
      slug: full.slug,
      businessName: full.businessName,
      description: full.description,
      industry: full.industry,
      category: full.category,
      businessType: full.businessType,
      website: full.website,
      location: {
        country: full.country,
        state: full.state,
        city: full.city,
        timeZone: full.timeZone,
      },
      preferredLanguage: full.preferredLanguage,
      currency: full.currency,
    },
    goals: {
      targetMarket: full.targetMarket,
      goals: full.businessGoals,
      primaryOfferings: full.primaryOfferings,
      usp: full.usp,
      marketingChallenges: full.marketingChallenges,
      competitors: full.competitors,
      socialLinks: (full.socialLinks as Record<string, string> | null) ?? null,
    },
    brand: full.brandIdentity
      ? {
          brandName: full.brandIdentity.brandName,
          logoUrl: full.brandIdentity.logoAsset?.currentVersion
            ? await resolveDownloadUrl(full.brandIdentity.logoAsset.currentVersion.storageKey)
            : null,
          primaryColor: full.brandIdentity.primaryColor,
          secondaryColor: full.brandIdentity.secondaryColor,
          accentColor: full.brandIdentity.accentColor,
          typographyPreference: full.brandIdentity.typographyPreference,
          personality: full.brandIdentity.personality,
          tone: full.brandIdentity.tone,
          toneOfVoice: full.brandIdentity.toneOfVoice,
          wordsToUse: full.brandIdentity.wordsToUse,
          wordsToAvoid: full.brandIdentity.wordsToAvoid,
          brandValues: full.brandIdentity.brandValues,
          mission: full.brandIdentity.mission,
          positioning: full.brandIdentity.positioning,
          tagline: full.brandIdentity.tagline,
          communicationStyle: full.brandIdentity.communicationStyle,
        }
      : null,
    audienceSegments,
    primaryAudience,
    brandAssets,
    profileCompletionScore: completionScore,
    resolvedAt: new Date().toISOString(),
  };
}
