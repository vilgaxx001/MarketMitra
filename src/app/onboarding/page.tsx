import type { Metadata } from "next";
import { getAuthOrRedirect } from "@/lib/middleware/require-auth";
import { WorkspaceSetupForm } from "./_components/workspace-setup-form";

export const metadata: Metadata = { title: "Set up your workspace" };

export default async function OnboardingStartPage() {
  await getAuthOrRedirect(); // any authenticated user may start a new workspace

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex h-16 items-center px-6">
        <span className="text-lg font-bold tracking-tight bg-gradient-to-r from-foreground to-primary bg-clip-text text-transparent">
          MarketMitra
        </span>
      </header>
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Let&apos;s set up your workspace</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            A workspace holds your businesses, team, and brand assets. You can create more later.
          </p>
          <div className="glass mt-6 rounded-xl p-6">
            <WorkspaceSetupForm />
          </div>
        </div>
      </main>
    </div>
  );
}
