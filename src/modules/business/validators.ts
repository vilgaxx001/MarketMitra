/**
 * src/modules/business/validators.ts
 */
import { z } from "zod";

const stringListField = (maxItems: number, maxLen = 200) =>
  z.array(z.string().trim().min(1).max(maxLen)).max(maxItems).optional();

export const businessBasicsSchema = z.object({
  businessName: z.string().trim().min(2, "Business name must be at least 2 characters").max(120),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  industry: z.string().trim().max(80).optional().or(z.literal("")),
  category: z.string().trim().max(80).optional().or(z.literal("")),
  businessType: z.enum(["PRODUCT", "SERVICE", "HYBRID"]).optional(),
  website: z.string().trim().url("Enter a valid URL").optional().or(z.literal("")),
});
export type BusinessBasicsInput = z.infer<typeof businessBasicsSchema>;

export const businessLocationSchema = z.object({
  country: z.string().trim().max(80).optional().or(z.literal("")),
  state: z.string().trim().max(80).optional().or(z.literal("")),
  city: z.string().trim().max(80).optional().or(z.literal("")),
  timeZone: z.string().trim().max(60).optional().or(z.literal("")),
  preferredLanguage: z.string().trim().max(40).optional().or(z.literal("")),
  currency: z.string().trim().length(3, "Use a 3-letter currency code, e.g. INR").optional().or(z.literal("")),
});
export type BusinessLocationInput = z.infer<typeof businessLocationSchema>;

export const businessGoalsSchema = z.object({
  targetMarket: z.string().trim().max(500).optional().or(z.literal("")),
  businessGoals: stringListField(15, 200),
  primaryOfferings: stringListField(20, 150),
  usp: z.string().trim().max(500).optional().or(z.literal("")),
  marketingChallenges: stringListField(15, 200),
  competitors: stringListField(15, 150),
  socialLinks: z.record(z.string(), z.string().trim().max(300)).optional(),
});
export type BusinessGoalsInput = z.infer<typeof businessGoalsSchema>;

/** Full update schema — union of all sections; every field optional so partial-form updates from any settings tab validate correctly. */
export const updateBusinessSchema = businessBasicsSchema
  .partial()
  .merge(businessLocationSchema.partial())
  .merge(businessGoalsSchema.partial());
export type UpdateBusinessInput = z.infer<typeof updateBusinessSchema>;

/** Creation requires at least the business name — everything else can be filled in progressively (see Business Onboarding). */
export const createBusinessSchema = businessBasicsSchema.pick({ businessName: true }).merge(
  businessBasicsSchema.partial().omit({ businessName: true })
);
export type CreateBusinessInput = z.infer<typeof createBusinessSchema>;
