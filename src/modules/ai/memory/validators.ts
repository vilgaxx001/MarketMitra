/**
 * src/modules/ai/memory/validators.ts
 *
 * Memory text is ORDINARY DATA. These validators keep it that way:
 * control characters and angle brackets are rejected (so stored text cannot
 * forge prompt delimiter tags if a later module renders it), obvious
 * secret/credential/payment-card shapes are rejected (best effort — a
 * heuristic, not a guarantee), and every field is length-bounded.
 * Unknown fields are rejected, so a client cannot set businessId, status,
 * createdById, updatedById or any other server-controlled column.
 */
import { z } from "zod";
import {
  BUSINESS_MEMORY_TYPES, MEMORY_LIMITS, MEMORY_LIST_VIEWS,
} from "./types";

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const ANGLE_BRACKETS = /[<>]/;
const SECRET_KEY_NAME = /password|passwd|token|secret|api[_-]?key|credential|authorization|private[_-]?key/i;

const SECRET_SHAPES: RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{20,}/,                       // OpenAI/Anthropic-style keys
  /\bAIza[0-9A-Za-z_-]{30,}/,                      // Google API keys
  /\bAKIA[0-9A-Z]{16}\b/,                          // AWS access key IDs
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,            // PEM private keys
  /\bBearer\s+[A-Za-z0-9._~+/-]{20,}/i,            // bearer tokens
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./, // JWTs
];

function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/** Best-effort detection of credentials and payment-card numbers. Exported for tests. */
export function looksLikeSecret(text: string): boolean {
  if (SECRET_SHAPES.some((re) => re.test(text))) return true;
  for (const m of text.matchAll(/\b(?:\d[ -]?){13,19}\b/g)) {
    const digits = m[0].replace(/[ -]/g, "");
    if (digits.length >= 13 && digits.length <= 19 && luhnValid(digits)) return true;
  }
  return false;
}

const safeText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be at most ${max} characters`)
    .refine((v) => !CONTROL_CHARS.test(v), "Contains unsupported control characters")
    .refine((v) => !ANGLE_BRACKETS.test(v), "The characters < and > are not allowed")
    .refine((v) => !looksLikeSecret(v), "Looks like a credential or payment card number, which must not be stored");

const contentField = safeText(MEMORY_LIMITS.contentMaxLength).refine((v) => v.length > 0, "Content cannot be empty");
const labelField = safeText(MEMORY_LIMITS.labelMaxLength);

const metadataValue = z.union([
  safeText(MEMORY_LIMITS.metadataValueMaxLength),
  z.number().finite(),
  z.boolean(),
]);
/**
 * zod 4 silently DROPS an own "__proto__" key while parsing a record instead of rejecting it, so a post-parse refinement can never
 * see it. Reject it explicitly on the RAW input first (zod 3 rejected it through the key regex). Only the raw own-property check
 * can detect a JSON.parse'd `{"__proto__": ...}` payload.
 */
const rejectProtoKey = z.unknown().superRefine((raw, ctx) => {
  if (raw !== null && typeof raw === "object" && !Array.isArray(raw) && Object.getOwnPropertyNames(raw).includes("__proto__")) {
    ctx.addIssue({ code: "custom", message: "This key name is not allowed" });
  }
});

const metadataRecord = z
  .record(
    z.string().min(1).max(MEMORY_LIMITS.metadataKeyMaxLength).regex(/^[A-Za-z][A-Za-z0-9_.-]*$/, "Keys must start with a letter and use letters, digits, _ . -")
      .refine((k) => !SECRET_KEY_NAME.test(k), "This key name is not allowed"),
    metadataValue
  )
  .refine((m) => Object.keys(m).length <= MEMORY_LIMITS.metadataMaxKeys, `At most ${MEMORY_LIMITS.metadataMaxKeys} metadata keys`)
  .refine((m) => JSON.stringify(m).length <= MEMORY_LIMITS.metadataMaxSerializedLength, `Metadata must be at most ${MEMORY_LIMITS.metadataMaxSerializedLength} characters when serialized`);
const metadataField = rejectProtoKey.pipe(metadataRecord);

/** ISO-8601 with offset/Z. Must be in the future when set. */
const expiresAtField = z
  .string()
  .datetime({ offset: true })
  .refine((v) => Date.parse(v) > Date.now(), "expiresAt must be in the future")
  .transform((v) => new Date(v));

export const createBusinessMemorySchema = z
  .object({
    type: z.enum(BUSINESS_MEMORY_TYPES),
    content: contentField,
    label: labelField.optional(),
    metadata: metadataField.optional(),
    expiresAt: expiresAtField.optional(),
  })
  .strict();
export type CreateBusinessMemoryInput = z.infer<typeof createBusinessMemorySchema>;

/** At least one field. label ""/null clears; metadata null clears (stored as {}); expiresAt null clears. */
export const updateBusinessMemorySchema = z
  .object({
    type: z.enum(BUSINESS_MEMORY_TYPES).optional(),
    content: contentField.optional(),
    label: labelField.nullable().optional(),
    metadata: metadataField.nullable().optional(),
    expiresAt: expiresAtField.nullable().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, "Provide at least one field to update");
export type UpdateBusinessMemoryInput = z.infer<typeof updateBusinessMemorySchema>;

export const listBusinessMemoriesQuerySchema = z
  .object({
    view: z.enum(MEMORY_LIST_VIEWS).default("active"),
    type: z.enum(BUSINESS_MEMORY_TYPES).optional(),
    limit: z.coerce.number().int().min(1).max(MEMORY_LIMITS.listMaxLimit).default(MEMORY_LIMITS.listDefaultLimit),
    offset: z.coerce.number().int().min(0).max(100_000).default(0),
  })
  .strict();
export type ListBusinessMemoriesQuery = z.infer<typeof listBusinessMemoriesQuerySchema>;

export const memoryIdSchema = z.string().cuid();
