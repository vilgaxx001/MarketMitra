/**
 * src/app/(auth)/signup/_components/signup-form.tsx
 */
"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { signupSchema, type SignupInput } from "@/modules/auth/validators";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "@/components/ui/toast";
import { Eye, EyeOff, User, Mail, Lock } from "lucide-react";
import { useState } from "react";

export function SignupForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submittedTo, setSubmittedTo] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: { acceptTerms: false },
  });

  const onSubmit = async (data: SignupInput) => {
    setServerError(null);
    try {
      const res = await fetch("/api/v1/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const json = await res.json();

      if (!res.ok) {
        if (json.error?.details) {
          setServerError(json.error.details[0]?.message ?? json.error.message);
        } else {
          setServerError(json.error?.message ?? "Signup failed. Please try again.");
        }
        return;
      }

      // The server answers identically whether or not the address is already registered, so this screen must not claim
      // "account created": it says what is true for both cases. The user signs in from here once the account exists.
      toast.success("Check your email.");
      setSubmittedTo(data.email);
    } catch {
      setServerError("Something went wrong. Please check your connection and try again.");
    }
  };

  if (submittedTo) {
    return (
      <div className="space-y-4" role="status">
        <Alert>
          <AlertDescription>
            Check <strong>{submittedTo}</strong>. If this address can be registered, we have sent it instructions. If you already
            have an account, we have said so there.
          </AlertDescription>
        </Alert>
        <p className="text-sm text-muted-foreground">
          Your account is ready to use as soon as it is created, usually within a minute.{" "}
          <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">Log in</Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      {serverError && (
        <Alert variant="destructive">
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}

      {/* Name */}
      <div className="space-y-1.5">
        <Label htmlFor="name" required>Full name</Label>
        <Input
          id="name"
          placeholder="Priya Sharma"
          autoComplete="name"
          startIcon={<User />}
          aria-invalid={!!errors.name}
          {...register("name")}
        />
        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
      </div>

      {/* Email */}
      <div className="space-y-1.5">
        <Label htmlFor="email" required>Email address</Label>
        <Input
          id="email"
          type="email"
          placeholder="priya@example.com"
          autoComplete="email"
          startIcon={<Mail />}
          aria-invalid={!!errors.email}
          {...register("email")}
        />
        {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
      </div>

      {/* Password */}
      <div className="space-y-1.5">
        <Label htmlFor="password" required>Password</Label>
        <Input
          id="password"
          type={showPassword ? "text" : "password"}
          placeholder="Min. 8 chars with a number and uppercase"
          autoComplete="new-password"
          startIcon={<Lock />}
          endIcon={
            <button
              type="button"
              className="pointer-events-auto"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          }
          aria-invalid={!!errors.password}
          {...register("password")}
        />
        {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
      </div>

      {/* Confirm password */}
      <div className="space-y-1.5">
        <Label htmlFor="confirmPassword" required>Confirm password</Label>
        <Input
          id="confirmPassword"
          type={showPassword ? "text" : "password"}
          placeholder="Repeat your password"
          autoComplete="new-password"
          startIcon={<Lock />}
          aria-invalid={!!errors.confirmPassword}
          {...register("confirmPassword")}
        />
        {errors.confirmPassword && (
          <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>
        )}
      </div>

      {/* Terms */}
      <div className="space-y-1.5">
        <div className="flex items-start gap-2">
          <Checkbox
            id="acceptTerms"
            aria-invalid={!!errors.acceptTerms}
            onCheckedChange={(checked) => setValue("acceptTerms", checked === true, { shouldValidate: true })}
            checked={watch("acceptTerms")}
          />
          <Label htmlFor="acceptTerms" className="font-normal leading-snug text-muted-foreground">
            I agree to the{" "}
            <a href="/terms" className="text-primary hover:underline" target="_blank" rel="noopener">
              Terms of Service
            </a>{" "}
            and{" "}
            <a href="/privacy" className="text-primary hover:underline" target="_blank" rel="noopener">
              Privacy Policy
            </a>
          </Label>
        </div>
        {errors.acceptTerms && (
          <p className="text-xs text-destructive">{errors.acceptTerms.message}</p>
        )}
      </div>

      <Button type="submit" className="w-full" isLoading={isSubmitting}>
        Create free account
      </Button>
    </form>
  );
}
