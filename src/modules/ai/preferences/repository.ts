/**
 * src/modules/ai/preferences/repository.ts
 *
 * Persistence only. Every function is keyed by businessId; callers
 * (service.ts) verify workspace ownership of that businessId first.
 */
import { db } from "@/lib/db";
import type { AIDetailLevelValue, AIFormattingPreferenceValue } from "./types";

export interface PreferencesWriteData {
  detailLevel?: AIDetailLevelValue;
  formatting?: AIFormattingPreferenceValue;
  businessInstructions?: string | null;
  behaviorConstraints?: string[];
}

export async function findByBusinessId(businessId: string) {
  return db.businessAIPreferences.findUnique({ where: { businessId } });
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "P2002";
}

/**
 * Atomic upsert keyed on the unique businessId. Two concurrent first
 * writes can race on the unique constraint (Prisma upsert is not
 * guaranteed atomic on create); on P2002 the row now exists, so one
 * retry takes the update path. Concurrent updates are last-write-wins
 * per provided field, matching the Module 4 brand-identity pattern.
 */
export async function upsert(businessId: string, data: PreferencesWriteData) {
  const run = () =>
    db.businessAIPreferences.upsert({
      where: { businessId },
      update: data,
      create: { business: { connect: { id: businessId } }, ...data },
    });
  try {
    return await run();
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    return run();
  }
}

/** Returns true if a row existed and was deleted. */
export async function deleteByBusinessId(businessId: string): Promise<boolean> {
  const result = await db.businessAIPreferences.deleteMany({ where: { businessId } });
  return result.count > 0;
}
