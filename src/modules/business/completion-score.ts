/**
 * src/modules/business/completion-score.ts
 *
 * Computes a real 0-100 completion score from whatever fields are
 * actually filled in — no fabricated progress, no rounding up "for
 * encouragement." Sections are weighted by how much they matter for
 * Module 5's output quality (brand identity and audience data matter
 * more to AI generation quality than, say, a timezone).
 */
import type { BusinessProfile, BrandIdentity } from "@prisma/client";

interface CompletionInput {
  business: Pick<
    BusinessProfile,
    | "businessName"
    | "description"
    | "industry"
    | "businessType"
    | "website"
    | "country"
    | "city"
    | "targetMarket"
    | "businessGoals"
    | "primaryOfferings"
    | "usp"
    | "marketingChallenges"
    | "competitors"
  >;
  brand: Pick<
    BrandIdentity,
    "brandName" | "primaryColor" | "tone" | "wordsToUse" | "brandValues" | "mission" | "tagline"
  > | null;
  audienceSegmentCount: number;
}

function isFilled(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}
function isFilledList(value: string[] | null | undefined): boolean {
  return Array.isArray(value) && value.length > 0;
}

export function computeProfileCompletionScore({ business, brand, audienceSegmentCount }: CompletionInput): number {
  const checks: boolean[] = [
    // Business basics
    isFilled(business.businessName),
    isFilled(business.description),
    isFilled(business.industry),
    business.businessType !== null,
    isFilled(business.website),
    isFilled(business.country),
    isFilled(business.city),
    isFilled(business.targetMarket),
    // Goals & positioning
    isFilledList(business.businessGoals),
    isFilledList(business.primaryOfferings),
    isFilled(business.usp),
    isFilledList(business.competitors) || isFilledList(business.marketingChallenges),
    // Brand identity
    brand !== null && isFilled(brand.brandName),
    brand !== null && isFilled(brand.primaryColor),
    brand !== null && isFilled(brand.tone),
    brand !== null && isFilledList(brand.wordsToUse),
    brand !== null && isFilledList(brand.brandValues),
    brand !== null && (isFilled(brand.mission) || isFilled(brand.tagline)),
    // Audience — weighted up (counted twice) since it's high-value for Module 5
    audienceSegmentCount > 0,
    audienceSegmentCount > 0,
  ];

  const filledCount = checks.filter(Boolean).length;
  return Math.round((filledCount / checks.length) * 100);
}
