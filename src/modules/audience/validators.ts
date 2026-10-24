/**
 * src/modules/audience/validators.ts
 */
import { z } from "zod";

const stringListField = (maxItems: number, maxLen = 100) =>
  z.array(z.string().trim().min(1).max(maxLen)).max(maxItems).optional();

export const audienceSegmentSchema = z.object({
  name: z.string().trim().min(2, "Segment name must be at least 2 characters").max(100),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  ageRange: z.string().trim().max(20).optional().or(z.literal("")),
  location: z.string().trim().max(150).optional().or(z.literal("")),
  language: z.string().trim().max(60).optional().or(z.literal("")),
  interests: stringListField(20),
  painPoints: stringListField(20),
  needs: stringListField(20),
  buyingMotivations: stringListField(20),
  objections: stringListField(20),
  preferredPlatforms: stringListField(15, 40),
  contentPreferences: stringListField(15, 60),
  customerType: z.string().trim().max(40).optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});
export type AudienceSegmentInput = z.infer<typeof audienceSegmentSchema>;

export const updateAudienceSegmentSchema = audienceSegmentSchema.partial();
export type UpdateAudienceSegmentInput = z.infer<typeof updateAudienceSegmentSchema>;
