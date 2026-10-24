/**
 * src/app/(app)/[workspaceSlug]/onboarding/_components/use-onboarding-step.ts
 *
 * Every data-bearing onboarding step (2-8) wires the same three things
 * together: a react-hook-form instance validated by that step's Zod
 * schema, the existing `useAutosave` hook (src/hooks/use-autosave.ts —
 * reused, not reimplemented) so in-progress typing survives a refresh,
 * and an explicit save-and-advance call for the Next button. This hook
 * is that wiring, so each step component only has to render its fields.
 */
"use client";

import { useForm, type UseFormReturn, type FieldValues, type DefaultValues } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ZodType } from "zod";
import { useAutosave, type AutosaveStatus } from "@/hooks/use-autosave";
import { toast } from "@/components/ui/toast";

interface UseOnboardingStepArgs<T extends FieldValues> {
  workspaceSlug: string;
  step: number;
  schema: ZodType<T>;
  defaultValues: DefaultValues<T>;
  onSaved?: (data: T) => void;
}

interface UseOnboardingStepReturn<T extends FieldValues> {
  form: UseFormReturn<T>;
  autosaveStatus: AutosaveStatus;
  /** Call from the Next button — validates, saves, and resolves once persisted. */
  saveAndContinue: () => Promise<boolean>;
}

async function postStep(workspaceSlug: string, step: number, data: unknown): Promise<boolean> {
  const res = await fetch(`/api/v1/workspaces/${workspaceSlug}/onboarding/step`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ step, data }),
  });
  return res.ok;
}

export function useOnboardingStep<T extends FieldValues>({
  workspaceSlug,
  step,
  schema,
  defaultValues,
  onSaved,
}: UseOnboardingStepArgs<T>): UseOnboardingStepReturn<T> {
  const form = useForm<T>({ resolver: zodResolver(schema), defaultValues, mode: "onBlur" });
  const values = form.watch();

  const { status: autosaveStatus } = useAutosave({
    data: values,
    debounceMs: 2000,
    onSave: async (data) => {
      const parsed = schema.safeParse(data);
      if (!parsed.success) return; // don't autosave invalid partial data — the explicit Next click will surface validation errors
      const ok = await postStep(workspaceSlug, step, parsed.data);
      if (ok) onSaved?.(parsed.data);
    },
  });

  async function saveAndContinue(): Promise<boolean> {
    const valid = await form.trigger();
    if (!valid) return false;
    const ok = await postStep(workspaceSlug, step, form.getValues());
    if (!ok) {
      toast.error("Couldn't save this step. Please try again.");
      return false;
    }
    onSaved?.(form.getValues());
    return true;
  }

  return { form, autosaveStatus, saveAndContinue };
}
