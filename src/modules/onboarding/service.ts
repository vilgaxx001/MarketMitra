/**
 * src/modules/onboarding/service.ts
 *
 * Deliberately thin: each step's actual data is persisted through the
 * real workspace/business/brand/audience services (createWorkspace,
 * createBusiness, updateBusiness, updateBrandIdentity, createSegment) —
 * not a separate draft/progress table. That means "resume later" is
 * just "load the workspace and its first business, and figure out
 * where to resume" — real, persisted progress, not a shadow copy that
 * could drift from the actual data.
 *
 * `Workspace.onboardingStep` is the one piece of state specific to
 * onboarding — advanced explicitly after each successful step, and
 * checked so a browser refresh resumes at the right screen (never at
 * step 1 with data loss).
 */
import { ApiException } from "@/lib/api-response";
import { logActivity } from "@/modules/activity/service";
import * as workspaceRepo from "@/modules/workspace/repository";
import * as businessRepo from "@/modules/business/repository";
import { createBusiness, updateBusiness } from "@/modules/business/service";
import { updateBrandIdentity } from "@/modules/brand/service";
import { createSegment, setPrimarySegment } from "@/modules/audience/service";
import {
  TOTAL_ONBOARDING_STEPS,
  step2Schema,
  step3Schema,
  step4Schema,
  step5Schema,
  step6Schema,
  step7Schema,
  step8Schema,
} from "./validators";

export async function advanceStep(workspaceId: string, step: number): Promise<void> {
  const clamped = Math.min(Math.max(step, 0), TOTAL_ONBOARDING_STEPS);
  await workspaceRepo.setOnboardingStep(workspaceId, clamped);
}

export interface OnboardingState {
  workspaceId: string;
  businessId: string | null;
  currentStep: number;
  isComplete: boolean;
}

export async function getOnboardingState(workspaceSlug: string): Promise<OnboardingState> {
  const workspace = await workspaceRepo.findWorkspaceBySlug(workspaceSlug);
  if (!workspace) throw new ApiException("NOT_FOUND", "Workspace not found.");

  const businesses = await businessRepo.listByWorkspace(workspace.id, true);
  const firstBusiness = businesses[0] ?? null;

  return {
    workspaceId: workspace.id,
    businessId: firstBusiness?.id ?? null,
    currentStep: workspace.onboardingStep,
    isComplete: workspace.onboardingCompletedAt !== null,
  };
}

export async function completeOnboarding(workspaceId: string, actorId: string): Promise<void> {
  await workspaceRepo.markOnboardingComplete(workspaceId);
  await workspaceRepo.setOnboardingStep(workspaceId, TOTAL_ONBOARDING_STEPS);

  await logActivity({
    workspaceId,
    actorId,
    action: "onboarding.completed",
    targetType: "workspace",
    targetId: workspaceId,
  });
}

/**
 * Dispatches one onboarding step's data to the real underlying service —
 * business/brand/audience data is written directly into those tables,
 * never into a separate draft copy. `step` must be 2-8 (step 1 is
 * workspace creation, handled by POST /api/v1/onboarding/start before a
 * workspace even exists; step 9 is review-only, no data of its own).
 */
export async function saveStep(
  workspaceId: string,
  actorId: string,
  step: number,
  data: unknown
): Promise<{ businessId: string | null }> {
  let businessId: string | null = null;

  switch (step) {
    case 2: {
      const parsed = step2Schema.parse(data);
      const businesses = await businessRepo.listByWorkspace(workspaceId, true);
      if (businesses.length === 0) {
        const created = await createBusiness(workspaceId, actorId, { businessName: parsed.businessName });
        businessId = created.id;
        await updateBusiness(businessId, workspaceId, actorId, {
          description: parsed.description,
          website: parsed.website,
        });
      } else {
        const existingId = businesses[0]?.id;
        if (!existingId) throw new ApiException("INTERNAL_ERROR", "Business lookup failed unexpectedly.");
        businessId = existingId;
        // Non-null assertion justified: existingId (assigned above) is
        // proven non-null by the throw-guard immediately preceding it —
        // this works around a TS control-flow narrowing gap for an
        // outer-scoped `let` reassigned across switch-case branches.
        await updateBusiness(businessId!, workspaceId, actorId, parsed);
      }
      break;
    }
    case 3: {
      const parsed = step3Schema.parse(data);
      businessId = await requireOnboardingBusinessId(workspaceId);
      await updateBusiness(businessId, workspaceId, actorId, parsed);
      break;
    }
    case 4: {
      const parsed = step4Schema.parse(data);
      businessId = await requireOnboardingBusinessId(workspaceId);
      await updateBusiness(businessId, workspaceId, actorId, parsed);
      break;
    }
    case 5: {
      const parsed = step5Schema.parse(data);
      businessId = await requireOnboardingBusinessId(workspaceId);
      const segment = await createSegment(businessId, workspaceId, actorId, {
        name: parsed.name,
        ageRange: parsed.ageRange,
        location: parsed.location,
        interests: parsed.interests ?? [],
        painPoints: parsed.painPoints ?? [],
        customerType: parsed.customerType,
        needs: [],
        buyingMotivations: [],
        objections: [],
        preferredPlatforms: [],
        contentPreferences: [],
      });
      // The first segment created during onboarding is the primary by default.
      await setPrimarySegment(segment.id, businessId, workspaceId, actorId);
      break;
    }
    case 6: {
      const parsed = step6Schema.parse(data);
      businessId = await requireOnboardingBusinessId(workspaceId);
      await updateBrandIdentity(businessId, workspaceId, actorId, parsed);
      break;
    }
    case 7: {
      const parsed = step7Schema.parse(data);
      businessId = await requireOnboardingBusinessId(workspaceId);
      await updateBusiness(businessId, workspaceId, actorId, parsed);
      break;
    }
    case 8: {
      const parsed = step8Schema.parse(data);
      businessId = await requireOnboardingBusinessId(workspaceId);
      await updateBrandIdentity(businessId, workspaceId, actorId, { logoAssetId: parsed.logoAssetId ?? null });
      break;
    }
    default:
      throw new ApiException("VALIDATION_ERROR", `Step ${step} has no data of its own.`);
  }

  await advanceStep(workspaceId, step);
  return { businessId };
}

async function requireOnboardingBusinessId(workspaceId: string): Promise<string> {
  const businesses = await businessRepo.listByWorkspace(workspaceId, true);
  const first = businesses[0];
  if (!first) {
    throw new ApiException("CONFLICT", "Complete the Business Basics step before continuing.");
  }
  return first.id;
}
