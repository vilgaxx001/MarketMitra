/**
 * src/modules/business/types.ts
 */
import type { BusinessType } from "@prisma/client";

export interface BusinessProfileDTO {
  id: string;
  workspaceId: string;
  slug: string;
  businessName: string;
  description: string | null;
  industry: string | null;
  category: string | null;
  businessType: BusinessType | null;
  website: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  timeZone: string | null;
  preferredLanguage: string | null;
  currency: string | null;
  targetMarket: string | null;
  businessGoals: string[];
  primaryOfferings: string[];
  usp: string | null;
  marketingChallenges: string[];
  competitors: string[];
  socialLinks: Record<string, string> | null;
  isActive: boolean;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  /** 0-100, computed from actually-filled fields only — see completion-score.ts. */
  profileCompletionScore: number;
}

/** Lightweight shape for the business switcher. */
export interface BusinessSummary {
  id: string;
  slug: string;
  businessName: string;
  industry: string | null;
  isActive: boolean;
}
