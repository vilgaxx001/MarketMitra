/**
 * src/app/(auth)/forgot-password/page.tsx
 */
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-bold tracking-tight">Forgot your password?</h1>
        <p className="text-sm text-muted-foreground">
          Enter your email and we&apos;ll send you a link to reset it
        </p>
      </div>
      <ForgotPasswordFormWrapper />
      <p className="text-center text-sm text-muted-foreground">
        <Link href="/login" className="font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}

async function ForgotPasswordFormWrapper() {
  const { ForgotPasswordForm } = await import("./_components/forgot-password-form");
  return <ForgotPasswordForm />;
}
