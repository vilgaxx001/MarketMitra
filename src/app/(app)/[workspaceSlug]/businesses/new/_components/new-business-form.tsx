"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { createBusinessSchema, type CreateBusinessInput } from "@/modules/business/validators";

export function NewBusinessForm({ workspaceSlug }: { workspaceSlug: string }) {
  const router = useRouter();
  const [limitError, setLimitError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateBusinessInput>({ resolver: zodResolver(createBusinessSchema) });

  async function onSubmit(data: CreateBusinessInput) {
    setLimitError(null);
    setServerError(null);
    const res = await fetch(`/api/v1/workspaces/${workspaceSlug}/businesses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) {
      if (json.error?.code === "PLAN_LIMIT_REACHED") {
        setLimitError(json.error.message);
      } else {
        setServerError(json.error?.message ?? "Something went wrong.");
      }
      return;
    }
    router.push(`/${workspaceSlug}/businesses/${json.data.id}`);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div>
        <Label htmlFor="businessName">Business name</Label>
        <Input id="businessName" autoFocus {...register("businessName")} aria-invalid={!!errors.businessName} />
        {errors.businessName && <p className="mt-1 text-xs text-destructive">{errors.businessName.message}</p>}
      </div>

      {limitError && (
        <Alert variant="warning">
          <AlertTitle>Plan limit reached</AlertTitle>
          <AlertDescription>{limitError}</AlertDescription>
        </Alert>
      )}
      {serverError && (
        <Alert variant="destructive">
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
        Create business
      </Button>
    </form>
  );
}
