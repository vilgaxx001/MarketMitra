/**
 * src/modules/ai/preferences/types.ts
 *
 * MODULE 5B.1 — Business AI Preferences contract.
 *
 * Field | Source | Allowed values / limit | Default | Affects
 * ------|--------|------------------------|---------|--------
 * language | Module 4 `BusinessProfile.preferredLanguage` (read-only here) | sanitized short text | none (no directive) | response generation only
 * tone | Module 4 `BrandIdentity.tone` (read-only here) | sanitized short text | none (no directive) | response generation only
 * detailLevel | stored | CONCISE / STANDARD / DETAILED | STANDARD (no directive) | response generation only
 * formatting | stored | NO_PREFERENCE / PLAIN_TEXT / MARKDOWN / BULLET_POINTS | NO_PREFERENCE (no directive) | response generation only
 * businessInstructions | stored | text, max 1000 chars, UNTRUSTED | null | response generation only
 * behaviorConstraints | stored | up to 10 items, max 200 chars each, UNTRUSTED | [] | response generation only
 *
 * NO preference affects model routing, provider selection, rate limits,
 * authorization or any application-enforced constraint. Language and
 * tone are NOT stored here — duplicating them would create a second,
 * drifting source of truth.
 */
export const AI_DETAIL_LEVELS = ["CONCISE", "STANDARD", "DETAILED"] as const;
export type AIDetailLevelValue = (typeof AI_DETAIL_LEVELS)[number];

export const AI_FORMATTING_PREFERENCES = ["NO_PREFERENCE", "PLAIN_TEXT", "MARKDOWN", "BULLET_POINTS"] as const;
export type AIFormattingPreferenceValue = (typeof AI_FORMATTING_PREFERENCES)[number];

export const AI_PREFERENCE_LIMITS = {
  businessInstructionsMaxLength: 1_000,
  behaviorConstraintMaxItems: 10,
  behaviorConstraintMaxLength: 200,
  derivedValueMaxLength: 60,
} as const;

/** Documented defaults for a business with no stored preferences. */
export const AI_PREFERENCE_DEFAULTS = {
  detailLevel: "STANDARD" as AIDetailLevelValue,
  formatting: "NO_PREFERENCE" as AIFormattingPreferenceValue,
  businessInstructions: null as string | null,
  behaviorConstraints: [] as string[],
};

/** What the API returns: only stored, editable preference fields. No internal row id. */
export interface BusinessAIPreferencesDTO {
  businessId: string;
  detailLevel: AIDetailLevelValue;
  formatting: AIFormattingPreferenceValue;
  businessInstructions: string | null;
  behaviorConstraints: string[];
  /** true when no row exists and the documented defaults are being reported. */
  isDefault: boolean;
  updatedAt: Date | null;
}

export type DerivedPreferenceSource = "business_profile" | "brand_identity";

/** The typed value placed on the AI execution context. */
export interface EffectiveBusinessAIPreferences {
  language: { value: string; source: DerivedPreferenceSource } | null;
  tone: { value: string; source: DerivedPreferenceSource } | null;
  detailLevel: AIDetailLevelValue;
  formatting: AIFormattingPreferenceValue;
  businessInstructions: string | null;
  behaviorConstraints: string[];
}
