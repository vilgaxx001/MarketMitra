/**
 * src/modules/brand/types.ts
 */
export interface BrandIdentityDTO {
  id: string;
  businessId: string;
  brandName: string | null;
  logoAssetId: string | null;
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
  createdAt: Date;
  updatedAt: Date;
}
