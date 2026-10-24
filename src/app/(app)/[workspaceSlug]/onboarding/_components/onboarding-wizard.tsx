/**
 * src/app/(app)/[workspaceSlug]/onboarding/_components/onboarding-wizard.tsx
 */
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { ONBOARDING_STEPS, TOTAL_ONBOARDING_STEPS } from "@/modules/onboarding/validators";
import {
  Step2Basics,
  Step3Industry,
  Step4Offerings,
  Step5Audience,
  Step6Brand,
  Step7Goals,
  Step8Assets,
} from "./steps";

export function OnboardingWizard({
  workspaceSlug,
  initialStep,
  businessId,
}: {
  workspaceSlug: string;
  initialStep: number;
  businessId: string | null;
}) {
  const router = useRouter();
  // Onboarding always resumes at max(2, savedStep) — step 1 (workspace
  // creation) is already done by the time this component mounts.
  const [step, setStep] = useState(Math.max(2, initialStep));
  const [completing, setCompleting] = useState(false);

  // Native-navigation protection: real, persisted autosave means the
  // worst case on a refresh is losing a few seconds of unsent keystrokes
  // — still worth a warning rather than silent loss.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  const progressPct = Math.round(((step - 1) / TOTAL_ONBOARDING_STEPS) * 100);
  const stepMeta = ONBOARDING_STEPS.find((s) => s.step === step);

  async function handleComplete() {
    setCompleting(true);
    try {
      const res = await fetch(`/api/v1/workspaces/${workspaceSlug}/onboarding/complete`, { method: "POST" });
      if (res.ok) {
        toast.success("You're all set!");
        router.push(`/${workspaceSlug}/dashboard`);
      } else {
        toast.error("Couldn't complete onboarding. Please try again.");
      }
    } finally {
      setCompleting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <div className="mb-8">
        <div className="mb-2 flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Step {step - 1} of {TOTAL_ONBOARDING_STEPS - 1}
          </span>
          <span>{stepMeta?.title}</span>
        </div>
        <Progress value={progressPct} />
      </div>

      <div className="glass rounded-xl p-6 md:p-8">
        {step === 2 && (
          <Step2Basics workspaceSlug={workspaceSlug} onNext={() => setStep(3)} onBack={() => setStep(2)} />
        )}
        {step === 3 && (
          <Step3Industry workspaceSlug={workspaceSlug} onNext={() => setStep(4)} onBack={() => setStep(2)} />
        )}
        {step === 4 && (
          <Step4Offerings workspaceSlug={workspaceSlug} onNext={() => setStep(5)} onBack={() => setStep(3)} />
        )}
        {step === 5 && (
          <Step5Audience workspaceSlug={workspaceSlug} onNext={() => setStep(6)} onBack={() => setStep(4)} />
        )}
        {step === 6 && (
          <Step6Brand workspaceSlug={workspaceSlug} onNext={() => setStep(7)} onBack={() => setStep(5)} />
        )}
        {step === 7 && (
          <Step7Goals workspaceSlug={workspaceSlug} onNext={() => setStep(8)} onBack={() => setStep(6)} />
        )}
        {step === 8 && (
          <Step8Assets
            workspaceSlug={workspaceSlug}
            businessId={businessId}
            onNext={() => setStep(9)}
            onBack={() => setStep(7)}
          />
        )}
        {step === 9 && (
          <div className="space-y-6 text-center">
            <CheckCircle2 className="mx-auto size-12 text-success" aria-hidden="true" />
            <div>
              <h2 className="text-xl font-semibold text-foreground">Review &amp; complete</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Everything you entered is already saved — you can refine any of it later from Business
                Settings. Ready to go to your dashboard?
              </p>
            </div>
            <div className="flex justify-between">
              <Button type="button" variant="outline" onClick={() => setStep(8)}>
                Back
              </Button>
              <Button type="button" onClick={handleComplete} disabled={completing}>
                {completing ? <Loader2 className="size-4 animate-spin" /> : null}
                Go to dashboard
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
