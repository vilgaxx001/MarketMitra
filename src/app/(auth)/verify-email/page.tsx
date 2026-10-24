/**
 * src/app/(auth)/verify-email/page.tsx
 *
 * Handles both states:
 *   1. Token present in URL → verifies automatically on mount.
 *   2. No token → "check your email" holding screen with resend option.
 *
 * This is a Server Component that renders a Client Component for the
 * interactive parts (the auto-verification call, resend button).
 */
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Verify your email" };

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { token } = await searchParams;
  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-bold tracking-tight">Verify your email</h1>
        <p className="text-sm text-muted-foreground">
          {token ? "Verifying your email address…" : "Check your inbox for a verification link"}
        </p>
      </div>
      <VerifyEmailClientWrapper token={token} />
    </div>
  );
}

async function VerifyEmailClientWrapper({ token }: { token?: string }) {
  const { VerifyEmailClient } = await import("./_components/verify-email-client");
  return <VerifyEmailClient token={token} />;
}
