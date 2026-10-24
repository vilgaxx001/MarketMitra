/**
 * src/app/(auth)/reset-password/page.tsx
 */
import type { Metadata } from "next";
import { Suspense } from "react";

export const metadata: Metadata = { title: "Set new password" };

export default function ResetPasswordPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-bold tracking-tight">Set a new password</h1>
        <p className="text-sm text-muted-foreground">
          Choose a strong password for your account
        </p>
      </div>
      {/* useSearchParams() in the form needs a Suspense boundary for static prerender (see login/page.tsx). */}
      <Suspense fallback={null}>
        <ResetPasswordFormWrapper />
      </Suspense>
    </div>
  );
}

async function ResetPasswordFormWrapper() {
  const { ResetPasswordForm } = await import("./_components/reset-password-form");
  return <ResetPasswordForm />;
}
