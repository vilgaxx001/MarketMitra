/**
 * src/modules/ai/preferences/service.ts
 *
 * Business AI Preferences service. Ownership boundary: a preferences row
 * belongs to exactly one BusinessProfile, which belongs to one workspace.
 * Every entry point re-verifies that the businessId belongs to the
 * caller's already-authorized workspace before touching preference data
 * (IDOR guard — never trust a client-supplied businessId).
 */
import { ApiException } from "@/lib/api-response";
import { requireBusinessAccess } from "@/lib/middleware/require-business";
import { logActivity } from "@/modules/activity/service";
import * as businessRepo from "@/modules/business/repository";
import * as repo from "./repository";
import { AI_PREFERENCE_DEFAULTS, AI_PREFERENCE_LIMITS } from "./types";
import type { WorkspaceUser } from "@/modules/auth/types";
import type { BusinessContext } from "@/types/business-context";
import type { UpdateBusinessAIPreferencesInput } from "./validators";
import type {
  BusinessAIPreferencesDTO, EffectiveBusinessAIPreferences, AIDetailLevelValue, AIFormattingPreferenceValue,
} from "./types";

type StoredRow = NonNullable<Awaited<ReturnType<typeof repo.findByBusinessId>>>;

function toDTO(businessId: string, row: StoredRow | null): BusinessAIPreferencesDTO {
  if (!row) return { businessId, ...AI_PREFERENCE_DEFAULTS, behaviorConstraints: [], isDefault: true, updatedAt: null };
  return {
    businessId,
    detailLevel: row.detailLevel as AIDetailLevelValue,
    formatting: row.formatting as AIFormattingPreferenceValue,
    businessInstructions: row.businessInstructions,
    behaviorConstraints: row.behaviorConstraints,
    isDefault: false,
    updatedAt: row.updatedAt,
  };
}

async function assertBusinessInWorkspace(businessId: string, workspaceId: string): Promise<void> {
  const business = await businessRepo.findByIdInWorkspace(businessId, workspaceId);
  if (!business) throw new ApiException("NOT_FOUND", "Business not found.");
}

export async function getBusinessAIPreferences(businessId: string, workspaceId: string): Promise<BusinessAIPreferencesDTO> {
  await assertBusinessInWorkspace(businessId, workspaceId);
  return toDTO(businessId, await repo.findByBusinessId(businessId));
}

export async function updateBusinessAIPreferences(
  businessId: string, workspaceId: string, actorId: string, input: UpdateBusinessAIPreferencesInput
): Promise<BusinessAIPreferencesDTO> {
  await assertBusinessInWorkspace(businessId, workspaceId);
  const row = await repo.upsert(businessId, {
    ...(input.detailLevel !== undefined && { detailLevel: input.detailLevel }),
    ...(input.formatting !== undefined && { formatting: input.formatting }),
    ...(input.businessInstructions !== undefined && { businessInstructions: input.businessInstructions ? input.businessInstructions : null }),
    ...(input.behaviorConstraints !== undefined && { behaviorConstraints: input.behaviorConstraints }),
  });
  // Field names only — never the instruction/constraint text itself.
  await logActivity({ workspaceId, actorId, action: "ai_preferences.updated", targetType: "ai_preferences", targetId: row.id, metadata: { businessId, fields: Object.keys(input) } });
  return toDTO(businessId, row);
}

/** Reset = delete the row, so the documented defaults apply. Idempotent. */
export async function resetBusinessAIPreferences(businessId: string, workspaceId: string, actorId: string): Promise<BusinessAIPreferencesDTO> {
  await assertBusinessInWorkspace(businessId, workspaceId);
  const existed = await repo.deleteByBusinessId(businessId);
  if (existed) {
    await logActivity({ workspaceId, actorId, action: "ai_preferences.reset", targetType: "ai_preferences", targetId: businessId, metadata: { businessId } });
  }
  return toDTO(businessId, null);
}

// Letters/digits first, then letters, digits, space and a few separators. Anything else is dropped (not repaired).
const DERIVED_VALUE = /^[\p{L}\p{N}][\p{L}\p{N} ,'&/-]*$/u;
function sanitizeDerived(value: string | null | undefined): string | null {
  const v = value?.trim();
  if (!v || v.length > AI_PREFERENCE_LIMITS.derivedValueMaxLength) return null;
  return DERIVED_VALUE.test(v) ? v : null;
}

/**
 * The integration point used by resolveExecutionContext(). Re-verifies
 * business access (same pattern as resolveBusinessContext), reads the
 * stored row, and merges in the Module 4 language/tone that are already
 * on the resolved BusinessContext — no second read of those sources.
 */
export async function resolveEffectiveAIPreferences(
  workspaceUser: WorkspaceUser, businessId: string, businessContext: BusinessContext
): Promise<EffectiveBusinessAIPreferences> {
  await requireBusinessAccess(workspaceUser, businessId);
  const row = await repo.findByBusinessId(businessId);
  const language = sanitizeDerived(businessContext.business.preferredLanguage);
  const tone = sanitizeDerived(businessContext.brand?.tone);
  return {
    language: language ? { value: language, source: "business_profile" } : null,
    tone: tone ? { value: tone, source: "brand_identity" } : null,
    detailLevel: (row?.detailLevel as AIDetailLevelValue | undefined) ?? AI_PREFERENCE_DEFAULTS.detailLevel,
    formatting: (row?.formatting as AIFormattingPreferenceValue | undefined) ?? AI_PREFERENCE_DEFAULTS.formatting,
    businessInstructions: row?.businessInstructions ?? null,
    behaviorConstraints: row?.behaviorConstraints ?? [],
  };
}
