/**
 * src/modules/audience/types.ts
 */
export interface AudienceSegmentDTO {
  id: string;
  businessId: string;
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
  notes: string | null;
  isPrimary: boolean;
  isActive: boolean;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
