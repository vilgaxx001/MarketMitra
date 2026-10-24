/**
 * src/app/(auth)/reset-password/_components/reset-password-form.tsx
 */
"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useSearchParams, useRouter } from "next/navigation";
import { resetPasswordSchema, type ResetPasswordInput } from "@/modules/auth/validators";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SuccessState, ErrorView } from "@/components/patterns/state-views";
import { Lock, Eye, EyeOff } from "lucide-react";
import { useState } from "react";

export function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token") ?? "";
  const [showPassword, setShowPassword] = useState(false);
  const [done, setDone] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token },
  });

  if (!token) {
    return (
      <ErrorView
        title="Invalid reset link"
        description="This password reset link is missing a token. Please request a new one."
        onRetry={() => router.push("/forgot-password")}
        retryLabel="Request new link"
      />
    );
  }

  if (done) {
    return (
      <SuccessState
        title="Password updated"
        description="Your password has been changed. You can now sign in with your new password."
        action={
          <Button onClick={() => router.push("/login")}>Sign in</Button>
        }
      />
    );
  }

  const onSubmit = async (data: ResetPasswordInput) => {
    setServerError(null);
    try {
      const res = await fetch("/api/v1/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) { setServerError(json.error?.message ?? "Reset failed."); return; }
      setDone(true);
    } catch {
      setServerError("Something went wrong. Please try again.");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      {serverError && (
        <Alert variant="destructive"><AlertDescription>{serverError}</AlertDescription></Alert>
      )}
      <input type="hidden" {...register("token")} />

      <div className="space-y-1.5">
        <Label htmlFor="password" required>New password</Label>
        <Input
          id="password"
          type={showPassword ? "text" : "password"}
          placeholder="Min. 8 chars with a number and uppercase"
          autoComplete="new-password"
          startIcon={<Lock />}
          endIcon={
            <button type="button" className="pointer-events-auto"
              onClick={() => setShowPassword(v => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}>
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          }
          aria-invalid={!!errors.password}
          {...register("password")}
        />
        {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="confirmPassword" required>Confirm new password</Label>
        <Input
          id="confirmPassword"
          type={showPassword ? "text" : "password"}
          placeholder="Repeat your new password"
          autoComplete="new-password"
          startIcon={<Lock />}
          aria-invalid={!!errors.confirmPassword}
          {...register("confirmPassword")}
        />
        {errors.confirmPassword && (
          <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>
        )}
      </div>

      <Button type="submit" className="w-full" isLoading={isSubmitting}>
        Set new password
      </Button>
    </form>
  );
}
