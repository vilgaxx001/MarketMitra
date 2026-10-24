/**
 * src/modules/brand/validators.ts
 */
import { z } from "zod";

const hexColor = z
  .string()
  .trim()
  .regex(/^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/, "Enter a valid hex color, e.g. #2563EB")
  .optional()
  .or(z.literal(""));

const stringListField = (maxItems: number, maxLen = 60) =>
  z.array(z.string().trim().min(1).max(maxLen)).max(maxItems).optional();

export const updateBrandIdentitySchema = z.object({
  brandName: z.string().trim().max(120).optional().or(z.literal("")),
  logoAssetId: z.string().cuid().optional().nullable(),
  primaryColor: hexColor,
  secondaryColor: hexColor,
  accentColor: hexColor,
  typographyPreference: z.string().trim().max(80).optional().or(z.literal("")),
  personality: stringListField(10, 40),
  tone: z.string().trim().max(60).optional().or(z.literal("")),
  toneOfVoice: z.string().trim().max(1000).optional().or(z.literal("")),
  wordsToUse: stringListField(30, 40),
  wordsToAvoid: stringListField(30, 40),
  brandValues: stringListField(10, 60),
  mission: z.string().trim().max(500).optional().or(z.literal("")),
  positioning: z.string().trim().max(500).optional().or(z.literal("")),
  tagline: z.string().trim().max(150).optional().or(z.literal("")),
  communicationStyle: z.string().trim().max(500).optional().or(z.literal("")),
});
export type UpdateBrandIdentityInput = z.infer<typeof updateBrandIdentitySchema>;
