/**
 * src/modules/ai/preferences/validators.ts
 */
import { z } from "zod";
import { AI_DETAIL_LEVELS, AI_FORMATTING_PREFERENCES, AI_PREFERENCE_LIMITS } from "./types";

// Control characters other than tab/newline are rejected; angle brackets are
// rejected so business text cannot forge the delimiter tags used when the
// preferences are rendered into a prompt (see directive.ts).
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const ANGLE_BRACKETS = /[<>]/;

const safeText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be at most ${max} characters`)
    .refine((v) => !CONTROL_CHARS.test(v), "Contains unsupported control characters")
    .refine((v) => !ANGLE_BRACKETS.test(v), "The characters < and > are not allowed");

/** Unknown fields are rejected (.strict()). At least one field is required. null / "" clears businessInstructions. */
export const updateBusinessAIPreferencesSchema = z
  .object({
    detailLevel: z.enum(AI_DETAIL_LEVELS).optional(),
    formatting: z.enum(AI_FORMATTING_PREFERENCES).optional(),
    businessInstructions: safeText(AI_PREFERENCE_LIMITS.businessInstructionsMaxLength).nullable().optional(),
    behaviorConstraints: z
      .array(safeText(AI_PREFERENCE_LIMITS.behaviorConstraintMaxLength).refine((v) => v.length > 0, "Constraints cannot be empty"))
      .max(AI_PREFERENCE_LIMITS.behaviorConstraintMaxItems)
      .optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, "Provide at least one preference to update");
export type UpdateBusinessAIPreferencesInput = z.infer<typeof updateBusinessAIPreferencesSchema>;
