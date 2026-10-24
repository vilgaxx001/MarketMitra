/**
 * src/app/(auth)/forgot-password/_components/forgot-password-form.tsx
 */
"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@/modules/auth/validators";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SuccessState } from "@/components/patterns/state-views";
import { Mail } from "lucide-react";
import { useState } from "react";

export function ForgotPasswordForm() {
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema) });

  const onSubmit = async (data: ForgotPasswordInput) => {
    setServerError(null);
    try {
      const res = await fetch("/api/v1/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) { setServerError(json.error?.message ?? "Request failed."); return; }
      setSubmitted(true);
    } catch {
      setServerError("Something went wrong. Please try again.");
    }
  };

  if (submitted) {
    return (
      <SuccessState
        title="Check your email"
        description={`If an account exists for ${getValues("email")}, we've sent a password reset link. Check your inbox (and spam folder).`}
        action={
          <p className="text-xs text-muted-foreground">
            Didn&apos;t receive it?{" "}
            <button
              className="text-primary hover:underline"
              onClick={() => setSubmitted(false)}
            >
              Try again
            </button>
          </p>
        }
      />
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      {serverError && (
        <Alert variant="destructive"><AlertDescription>{serverError}</AlertDescription></Alert>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="email" required>Email address</Label>
        <Input
          id="email"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          startIcon={<Mail />}
          aria-invalid={!!errors.email}
          {...register("email")}
        />
        {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
      </div>
      <Button type="submit" className="w-full" isLoading={isSubmitting}>
        Send reset link
      </Button>
    </form>
  );
}
