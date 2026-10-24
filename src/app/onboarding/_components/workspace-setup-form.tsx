"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { step1Schema, type Step1Input } from "@/modules/onboarding/validators";

export function WorkspaceSetupForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Step1Input>({ resolver: zodResolver(step1Schema) });

  async function onSubmit(data: Step1Input) {
    setServerError(null);
    const res = await fetch("/api/v1/onboarding/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) {
      setServerError(json.error?.message ?? "Something went wrong. Please try again.");
      return;
    }
    router.push(`/${json.data.slug}/onboarding`);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div>
        <Label htmlFor="name">Workspace name</Label>
        <Input id="name" autoFocus {...register("name")} aria-invalid={!!errors.name} placeholder="e.g. Acme Marketing" />
        {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name.message}</p>}
      </div>

      {serverError && (
        <Alert variant="destructive">
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
        Continue
      </Button>
    </form>
  );
}
