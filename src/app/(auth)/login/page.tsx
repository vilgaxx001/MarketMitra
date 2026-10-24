/**
 * src/app/(auth)/login/page.tsx
 */
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
        <p className="text-sm text-muted-foreground">Sign in to your MarketMitra account</p>
      </div>
      {/* The form reads the query string (useSearchParams), so Next.js requires a Suspense boundary: without it the
          static prerender of /login fails the production build. The form is rendered on the client. */}
      <Suspense fallback={null}>
        <LoginFormWrapper />
      </Suspense>
      <p className="text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="font-medium text-primary hover:underline">
          Create one free
        </Link>
      </p>
    </div>
  );
}

// The form is a Client Component; the page itself stays a Server Component.
async function LoginFormWrapper() {
  const { LoginForm } = await import("./_components/login-form");
  return <LoginForm />;
}
