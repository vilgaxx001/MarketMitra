/**
 * src/app/(app)/[workspaceSlug]/onboarding/_components/steps.tsx
 *
 * Steps 2-8. Every field validates through the exact same Zod schema the
 * Business Settings UI uses later (see src/modules/onboarding/validators.ts's
 * docstring) — nothing here is onboarding-only validation logic.
 */
"use client";

import { Controller } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { TagInput } from "@/components/ui/tag-input";
import { useOnboardingStep } from "./use-onboarding-step";
import {
  step2Schema,
  step3Schema,
  step4Schema,
  step5Schema,
  step6Schema,
  step7Schema,
  step8Schema,
  type Step2Input,
  type Step3Input,
  type Step4Input,
  type Step5Input,
  type Step6Input,
  type Step7Input,
  type Step8Input,
} from "@/modules/onboarding/validators";

interface StepProps {
  workspaceSlug: string;
  onNext: () => void;
  onBack: () => void;
}

function StepNav({ onBack, onNext, canGoBack = true }: { onBack: () => void; onNext: () => unknown; canGoBack?: boolean }) {
  return (
    <div className="mt-8 flex justify-between">
      <Button type="button" variant="outline" onClick={onBack} disabled={!canGoBack}>
        Back
      </Button>
      <Button type="button" onClick={() => onNext()}>
        Continue
      </Button>
    </div>
  );
}

export function Step2Basics({ workspaceSlug, onNext }: StepProps) {
  const { form, saveAndContinue } = useOnboardingStep<Step2Input>({
    workspaceSlug,
    step: 2,
    schema: step2Schema,
    defaultValues: { businessName: "", description: "", website: "" },
  });
  const {
    register,
    formState: { errors },
  } = form;

  return (
    <div className="space-y-5">
      <div>
        <Label htmlFor="businessName">Business name</Label>
        <Input id="businessName" {...register("businessName")} aria-invalid={!!errors.businessName} />
        {errors.businessName && <p className="mt-1 text-xs text-destructive">{errors.businessName.message}</p>}
      </div>
      <div>
        <Label htmlFor="description">What does your business do?</Label>
        <Textarea id="description" rows={3} {...register("description")} />
      </div>
      <div>
        <Label htmlFor="website">Website (optional)</Label>
        <Input id="website" placeholder="https://" {...register("website")} aria-invalid={!!errors.website} />
        {errors.website && <p className="mt-1 text-xs text-destructive">{errors.website.message}</p>}
      </div>
      <StepNav onBack={() => {}} onNext={async () => (await saveAndContinue()) && onNext()} canGoBack={false} />
    </div>
  );
}

export function Step3Industry({ workspaceSlug, onNext, onBack }: StepProps) {
  const { form, saveAndContinue } = useOnboardingStep<Step3Input>({
    workspaceSlug,
    step: 3,
    schema: step3Schema,
    defaultValues: { industry: "", category: "", country: "", state: "", city: "" },
  });
  const { register, control } = form;

  return (
    <div className="space-y-5">
      <div>
        <Label htmlFor="industry">Industry</Label>
        <Input id="industry" placeholder="e.g. Food & Restaurant" {...register("industry")} />
      </div>
      <div>
        <Label htmlFor="category">Category</Label>
        <Input id="category" placeholder="e.g. Cloud kitchen" {...register("category")} />
      </div>
      <div>
        <Label>Business type</Label>
        <Controller
          control={control}
          name="businessType"
          render={({ field }) => (
            <Select value={field.value ?? undefined} onValueChange={field.onChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select a type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PRODUCT">Product</SelectItem>
                <SelectItem value="SERVICE">Service</SelectItem>
                <SelectItem value="HYBRID">Both</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label htmlFor="country">Country</Label>
          <Input id="country" {...register("country")} />
        </div>
        <div>
          <Label htmlFor="state">State</Label>
          <Input id="state" {...register("state")} />
        </div>
        <div>
          <Label htmlFor="city">City</Label>
          <Input id="city" {...register("city")} />
        </div>
      </div>
      <StepNav onBack={onBack} onNext={async () => (await saveAndContinue()) && onNext()} />
    </div>
  );
}

export function Step4Offerings({ workspaceSlug, onNext, onBack }: StepProps) {
  const { form, saveAndContinue } = useOnboardingStep<Step4Input>({
    workspaceSlug,
    step: 4,
    schema: step4Schema,
    defaultValues: { primaryOfferings: [], usp: "" },
  });
  const { register, control } = form;

  return (
    <div className="space-y-5">
      <div>
        <Label>Products / services you offer</Label>
        <Controller
          control={control}
          name="primaryOfferings"
          render={({ field }) => (
            <TagInput value={field.value ?? []} onChange={field.onChange} placeholder="Add a product or service and press Enter" />
          )}
        />
      </div>
      <div>
        <Label htmlFor="usp">What makes you different from competitors?</Label>
        <Textarea id="usp" rows={3} {...register("usp")} />
      </div>
      <StepNav onBack={onBack} onNext={async () => (await saveAndContinue()) && onNext()} />
    </div>
  );
}

export function Step5Audience({ workspaceSlug, onNext, onBack }: StepProps) {
  const { form, saveAndContinue } = useOnboardingStep<Step5Input>({
    workspaceSlug,
    step: 5,
    schema: step5Schema,
    defaultValues: { name: "", ageRange: "", location: "", interests: [], painPoints: [], customerType: "" },
  });
  const { register, control } = form;

  return (
    <div className="space-y-5">
      <div>
        <Label htmlFor="name">Give this audience a name</Label>
        <Input id="name" placeholder="e.g. Busy urban professionals" {...register("name")} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="ageRange">Age range</Label>
          <Input id="ageRange" placeholder="25-34" {...register("ageRange")} />
        </div>
        <div>
          <Label htmlFor="location">Location</Label>
          <Input id="location" {...register("location")} />
        </div>
      </div>
      <div>
        <Label>Interests</Label>
        <Controller
          control={control}
          name="interests"
          render={({ field }) => <TagInput value={field.value ?? []} onChange={field.onChange} placeholder="Add an interest" />}
        />
      </div>
      <div>
        <Label>Pain points</Label>
        <Controller
          control={control}
          name="painPoints"
          render={({ field }) => <TagInput value={field.value ?? []} onChange={field.onChange} placeholder="What problem do they have?" />}
        />
      </div>
      <StepNav onBack={onBack} onNext={async () => (await saveAndContinue()) && onNext()} />
    </div>
  );
}

export function Step6Brand({ workspaceSlug, onNext, onBack }: StepProps) {
  const { form, saveAndContinue } = useOnboardingStep<Step6Input>({
    workspaceSlug,
    step: 6,
    schema: step6Schema,
    defaultValues: { personality: [], tone: "", toneOfVoice: "", wordsToUse: [], wordsToAvoid: [] },
  });
  const { register, control } = form;

  return (
    <div className="space-y-5">
      <div>
        <Label>Brand personality</Label>
        <Controller
          control={control}
          name="personality"
          render={({ field }) => (
            <TagInput value={field.value ?? []} onChange={field.onChange} placeholder="e.g. Bold, Modern, Friendly" />
          )}
        />
      </div>
      <div>
        <Label htmlFor="tone">Tone</Label>
        <Input id="tone" placeholder="e.g. Professional, Friendly, Luxury" {...register("tone")} />
      </div>
      <div>
        <Label htmlFor="toneOfVoice">Describe your voice</Label>
        <Textarea id="toneOfVoice" rows={3} {...register("toneOfVoice")} />
      </div>
      <div>
        <Label>Words you like to use</Label>
        <Controller
          control={control}
          name="wordsToUse"
          render={({ field }) => <TagInput value={field.value ?? []} onChange={field.onChange} placeholder="Add a word" />}
        />
      </div>
      <div>
        <Label>Words to avoid</Label>
        <Controller
          control={control}
          name="wordsToAvoid"
          render={({ field }) => <TagInput value={field.value ?? []} onChange={field.onChange} placeholder="Add a word" />}
        />
      </div>
      <StepNav onBack={onBack} onNext={async () => (await saveAndContinue()) && onNext()} />
    </div>
  );
}

export function Step7Goals({ workspaceSlug, onNext, onBack }: StepProps) {
  const { form, saveAndContinue } = useOnboardingStep<Step7Input>({
    workspaceSlug,
    step: 7,
    schema: step7Schema,
    defaultValues: { businessGoals: [], marketingChallenges: [], competitors: [] },
  });
  const { control } = form;

  return (
    <div className="space-y-5">
      <div>
        <Label>Business goals</Label>
        <Controller
          control={control}
          name="businessGoals"
          render={({ field }) => (
            <TagInput value={field.value ?? []} onChange={field.onChange} placeholder="e.g. Grow Instagram following" />
          )}
        />
      </div>
      <div>
        <Label>Marketing challenges</Label>
        <Controller
          control={control}
          name="marketingChallenges"
          render={({ field }) => (
            <TagInput value={field.value ?? []} onChange={field.onChange} placeholder="e.g. No time to post consistently" />
          )}
        />
      </div>
      <div>
        <Label>Competitors</Label>
        <Controller
          control={control}
          name="competitors"
          render={({ field }) => <TagInput value={field.value ?? []} onChange={field.onChange} placeholder="Add a competitor" />}
        />
      </div>
      <StepNav onBack={onBack} onNext={async () => (await saveAndContinue()) && onNext()} />
    </div>
  );
}

export function Step8Assets({ workspaceSlug, onNext, onBack, businessId }: StepProps & { businessId: string | null }) {
  const { saveAndContinue, form } = useOnboardingStep<Step8Input>({
    workspaceSlug,
    step: 8,
    schema: step8Schema,
    defaultValues: {},
  });

  // Logo upload is optional at this step — the full uploader (with S3
  // presign + dedup) lives in Business Settings > Brand Assets. Onboarding
  // offers a skip-friendly shortcut rather than duplicating that flow.
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        You can upload your logo now, or skip this and add it later from Brand Assets in Business Settings.
      </p>
      {businessId && (
        <p className="text-xs text-muted-foreground">
          Business ID ready for asset upload: <code>{businessId}</code>
        </p>
      )}
      <input type="hidden" {...form.register("logoAssetId")} />
      <StepNav onBack={onBack} onNext={async () => (await saveAndContinue()) && onNext()} />
    </div>
  );
}
