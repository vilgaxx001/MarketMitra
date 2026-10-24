import type { Metadata } from "next";
import { getWorkspaceUserOrRedirect } from "@/lib/middleware/require-auth";
import { getOnboardingState } from "@/modules/onboarding/service";
import { OnboardingWizard } from "./_components/onboarding-wizard";

export const metadata: Metadata = { title: "Business setup" };

export default async function OnboardingPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  await getWorkspaceUserOrRedirect(workspaceSlug);

  const state = await getOnboardingState(workspaceSlug);

  return (
    <OnboardingWizard
      workspaceSlug={workspaceSlug}
      initialStep={state.currentStep}
      businessId={state.businessId}
    />
  );
}
