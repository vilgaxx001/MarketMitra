/**
 * src/app/(auth)/layout.tsx
 *
 * Signed-in visitors are sent to /dashboard here (not in middleware): only requireAuth() can tell a LIVE session from a
 * token whose session row was deleted (logout elsewhere, password change/reset) or whose user was deactivated. A revoked
 * token must be allowed to reach /login, otherwise /login -> /dashboard -> /login redirects forever. With no cookie
 * requireAuth() returns before any database access, so anonymous visitors cost nothing.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/middleware/require-auth";

export const metadata: Metadata = {
  title: { template: "%s | MarketMitra", default: "Sign in to MarketMitra" },
};

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const signedIn = await requireAuth().then(() => true, () => false);
  if (signedIn) redirect("/dashboard");

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Top logo bar */}
      <header className="flex h-16 items-center px-6">
        <Link
          href="/"
          className="text-lg font-bold tracking-tight bg-gradient-to-r from-foreground to-primary bg-clip-text text-transparent"
        >
          MarketMitra
        </Link>
      </header>

      {/* Centered content */}
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md">{children}</div>
      </main>

      {/* Footer */}
      <footer className="flex h-14 items-center justify-center gap-6 px-6 text-xs text-muted-foreground">
        <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
        <Link href="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link>
        <span>© {new Date().getFullYear()} MarketMitra</span>
      </footer>
    </div>
  );
}
