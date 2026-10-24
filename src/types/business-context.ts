/**
 * src/types/business-context.ts
 *
 * THE MODULE 5 INTEGRATION CONTRACT.
 *
 * This is the stable, typed shape that `src/modules/context/service.ts`
 * (the Business Context Engine) resolves and returns. Module 5 (AI Core /
 * AI Memory / RAG / Chat / Marketing Agents / SEO Agent / Branding Agent
 * / Sales Agent / Business Strategy Agent / Content Generation /
 * Analytics) depends on this exact shape — changing a field name here is
 * a breaking change for every one of those future consumers, so treat it
 * with the same care as a public API.
 *
 * WHAT THIS IS NOT:
 *   - Not AI Memory. No embeddings, no vector search, no conversation
 *     history. This is trusted, structured, relational data only.
 *   - Not a place to call an AI provider. `resolveBusinessContext()` in
 *     src/modules/context/service.ts never imports an AI SDK.
 *   - Not client-trusted. Every field here is resolved server-side from
 *     the database after authorization checks — see
 *     docs/BUSINESS_CONTEXT_ENGINE.md for the exact resolution path.
 */

export interface WorkspaceContext {
  id: string;
  name: string;
  slug: string;
}

export interface BusinessIdentityContext {
  id: string;
  slug: string;
  businessName: string;
  description: string | null;
  industry: string | null;
  category: string | null;
  businessType: "PRODUCT" | "SERVICE" | "HYBRID" | null;
  website: string | null;
  location: {
    country: string | null;
    state: string | null;
    city: string | null;
    timeZone: string | null;
  };
  preferredLanguage: string | null;
  currency: string | null;
}

export interface BusinessGoalsContext {
  targetMarket: string | null;
  goals: string[];
  primaryOfferings: string[];
  usp: string | null;
  marketingChallenges: string[];
  competitors: string[];
  socialLinks: Record<string, string> | null;
}

export interface BrandIdentityContext {
  brandName: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColor: string | null;
  typographyPreference: string | null;
  personality: string[];
  tone: string | null;
  toneOfVoice: string | null;
  wordsToUse: string[];
  wordsToAvoid: string[];
  brandValues: string[];
  mission: string | null;
  positioning: string | null;
  tagline: string | null;
  communicationStyle: string | null;
}

export interface AudienceSegmentContext {
  id: string;
  name: string;
  description: string | null;
  ageRange: string | null;
  location: string | null;
  language: string | null;
  interests: string[];
  painPoints: string[];
  needs: string[];
  buyingMotivations: string[];
  objections: string[];
  preferredPlatforms: string[];
  contentPreferences: string[];
  customerType: string | null;
  isPrimary: boolean;
}

export interface BrandAssetMetadata {
  id: string;
  category: "LOGO" | "BRAND_ASSET" | "DOCUMENT" | "IMAGE" | "OTHER";
  name: string;
  mimeType: string;
  sizeBytes: number;
  /** Metadata only — never the raw file. Consumers needing the actual bytes fetch a fresh presigned URL via the assets module. */
  currentVersionId: string | null;
}

/**
 * The complete, resolved Business Context — everything Module 5 needs to
 * generate on-brand output for one business, and nothing it shouldn't
 * have access to.
 */
export interface BusinessContext {
  workspace: WorkspaceContext;
  business: BusinessIdentityContext;
  goals: BusinessGoalsContext;
  brand: BrandIdentityContext | null;
  audienceSegments: AudienceSegmentContext[];
  primaryAudience: AudienceSegmentContext | null;
  brandAssets: BrandAssetMetadata[];
  /** 0-100. Real, computed only from fields actually filled in — see src/modules/business/completion-score.ts. Never fabricated. */
  profileCompletionScore: number;
  resolvedAt: string; // ISO timestamp — Module 5 should treat context as a snapshot, not a live subscription
}
