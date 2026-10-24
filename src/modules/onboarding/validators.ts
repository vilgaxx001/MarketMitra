/**
 * src/modules/onboarding/validators.ts
 *
 * The 9-step flow doesn't invent new field validation — each step reuses
 * the exact same Zod schemas the settings UI uses (businessBasicsSchema,
 * businessLocationSchema, etc.), so a value that's valid during
 * onboarding is guaranteed valid later when edited from Business
 * Settings, and vice versa.
 */
import { z } from "zod";
import { createWorkspaceSchema } from "@/modules/workspace/validators";
import { businessBasicsSchema, businessLocationSchema, businessGoalsSchema } from "@/modules/business/validators";
import { audienceSegmentSchema } from "@/modules/audience/validators";
import { updateBrandIdentitySchema } from "@/modules/brand/validators";

export const ONBOARDING_STEPS = [
  { step: 1, key: "workspace", title: "Workspace Setup" },
  { step: 2, key: "basics", title: "Business Basics" },
  { step: 3, key: "industry", title: "Industry & Business Type" },
  { step: 4, key: "offerings", title: "Products / Services" },
  { step: 5, key: "audience", title: "Target Audience" },
  { step: 6, key: "brand", title: "Brand Personality & Tone" },
  { step: 7, key: "goals", title: "Goals & Marketing Challenges" },
  { step: 8, key: "assets", title: "Brand Assets" },
  { step: 9, key: "review", title: "Review & Complete" },
] as const;

export const TOTAL_ONBOARDING_STEPS = ONBOARDING_STEPS.length;

// Step 1
export const step1Schema = createWorkspaceSchema;
// Step 2 — business basics (name, description, website)
export const step2Schema = businessBasicsSchema.pick({ businessName: true, description: true, website: true });
// Step 3 — industry & type
export const step3Schema = businessBasicsSchema.pick({ industry: true, category: true, businessType: true }).merge(
  businessLocationSchema.pick({ country: true, state: true, city: true })
);
// Step 4 — offerings
export const step4Schema = businessGoalsSchema.pick({ primaryOfferings: true, usp: true });
// Step 5 — audience (a single primary segment, created directly)
export const step5Schema = audienceSegmentSchema.pick({
  name: true,
  ageRange: true,
  location: true,
  interests: true,
  painPoints: true,
  customerType: true,
});
// Step 6 — brand personality/tone
export const step6Schema = updateBrandIdentitySchema.pick({
  personality: true,
  tone: true,
  toneOfVoice: true,
  wordsToUse: true,
  wordsToAvoid: true,
});
// Step 7 — goals & challenges
export const step7Schema = businessGoalsSchema.pick({ businessGoals: true, marketingChallenges: true, competitors: true });
// Step 8 — brand assets (logo asset id, already uploaded via the assets module by this point)
export const step8Schema = z.object({ logoAssetId: z.string().cuid().optional() });
// Step 9 — review has no fields of its own; completion is a separate action.

export type Step1Input = z.infer<typeof step1Schema>;
export type Step2Input = z.infer<typeof step2Schema>;
export type Step3Input = z.infer<typeof step3Schema>;
export type Step4Input = z.infer<typeof step4Schema>;
export type Step5Input = z.infer<typeof step5Schema>;
export type Step6Input = z.infer<typeof step6Schema>;
export type Step7Input = z.infer<typeof step7Schema>;
export type Step8Input = z.infer<typeof step8Schema>;
