import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Building2 } from "lucide-react";
import { getWorkspaceUserOrRedirect } from "@/lib/middleware/require-auth";
import { listBusinesses } from "@/modules/business/service";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/patterns/state-views";

export const metadata: Metadata = { title: "Businesses" };

export default async function BusinessesPage({ params }: { params: Promise<{ workspaceSlug: string }> }) {
  const { workspaceSlug } = await params;
  const workspaceUser = await getWorkspaceUserOrRedirect(workspaceSlug);
  const businesses = await listBusinesses(workspaceUser.workspaceId);

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Businesses</h1>
        <Button asChild>
          <Link href={`/${workspaceSlug}/businesses/new`}>
            <Plus className="size-4" /> Add business
          </Link>
        </Button>
      </div>

      {businesses.length === 0 ? (
        <div className="mt-10">
          <EmptyState
            icon={Building2}
            title="No businesses yet"
            description="Add your first business to start building its profile, brand, and audience."
            action={
              <Button asChild>
                <Link href={`/${workspaceSlug}/businesses/new`}>Add your first business</Link>
              </Button>
            }
          />
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {businesses.map((b) => (
            <Link
              key={b.id}
              href={`/${workspaceSlug}/businesses/${b.id}`}
              className="glass rounded-xl p-5 transition-transform hover:-translate-y-0.5"
            >
              <h2 className="font-semibold text-foreground">{b.businessName}</h2>
              {b.industry && <p className="text-sm text-muted-foreground">{b.industry}</p>}
              {!b.isActive && (
                <span className="mt-2 inline-block rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  Archived
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
