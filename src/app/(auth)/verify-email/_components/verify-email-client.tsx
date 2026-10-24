/**
 * src/app/(auth)/verify-email/_components/verify-email-client.tsx
 */
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LoadingView, SuccessState, ErrorView } from "@/components/patterns/state-views";
import { toast } from "@/components/ui/toast";
import { MailCheck } from "lucide-react";

type VerifyStatus = "idle" | "verifying" | "success" | "error";

export function VerifyEmailClient({ token }: { token?: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<VerifyStatus>(token ? "verifying" : "idle");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [isResending, setIsResending] = useState(false);

  // If a token is present in the URL, verify automatically on mount
  useEffect(() => {
    if (!token) return;

    async function verify() {
      try {
        const res = await fetch("/api/v1/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const json = await res.json();

        if (!res.ok) {
          setErrorMessage(
            json.error?.message ??
              "This verification link has expired or already been used."
          );
          setStatus("error");
          return;
        }

        setStatus("success");
        // Redirect to dashboard after a short delay so the user sees the success state
        setTimeout(() => router.push("/dashboard"), 2000);
      } catch {
        setErrorMessage("Something went wrong. Please try again.");
        setStatus("error");
      }
    }

    verify();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleResend = async () => {
    setIsResending(true);
    try {
      const res = await fetch("/api/v1/auth/resend-verification", { method: "POST" });
      if (res.ok) {
        toast.success("Verification email sent — check your inbox.");
      } else {
        toast.error("Failed to resend. Please try again in a moment.");
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsResending(false);
    }
  };

  // ── Token in URL states ───────────────────────────────────────────────

  if (token && status === "verifying") {
    return <LoadingView label="Verifying your email address…" />;
  }

  if (token && status === "success") {
    return (
      <SuccessState
        title="Email verified!"
        description="Your email address has been confirmed. Taking you to your dashboard…"
      />
    );
  }

  if (token && status === "error") {
    return (
      <ErrorView
        title="Verification failed"
        description={errorMessage}
        onRetry={() => router.push("/forgot-password")}
        retryLabel="Request a new link"
      />
    );
  }

  // ── No token — holding screen ────────────────────────────────────────

  return (
    <div className="flex flex-col items-center gap-5 rounded-lg border border-border bg-card p-8 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
        <MailCheck className="size-6 text-primary" aria-hidden="true" />
      </div>
      <div className="space-y-1.5">
        <p className="font-medium">Check your inbox</p>
        <p className="text-sm text-muted-foreground">
          We&apos;ve sent a verification link to your email address. Click the link
          to activate your account.
        </p>
      </div>
      <div className="space-y-2 w-full">
        <Button
          variant="outline"
          className="w-full"
          onClick={handleResend}
          isLoading={isResending}
        >
          Resend verification email
        </Button>
        <Button
          variant="ghost"
          className="w-full text-muted-foreground"
          onClick={() => router.push("/login")}
        >
          Back to sign in
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Didn&apos;t receive it? Check your spam folder, or make sure you used the
        right email address.
      </p>
    </div>
  );
}
