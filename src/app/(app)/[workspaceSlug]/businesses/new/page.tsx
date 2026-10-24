import type { Metadata } from "next";
import { getWorkspaceUserOrRedirect } from "@/lib/middleware/require-auth";
import { NewBusinessForm } from "./_components/new-business-form";

export const metadata: Metadata = { title: "Add a business" };

export default async function NewBusinessPage({ params }: { params: Promise<{ workspaceSlug: string }> }) {
  const { workspaceSlug } = await params;
  await getWorkspaceUserOrRedirect(workspaceSlug);

  return (
    <div className="mx-auto max-w-lg px-6 py-10">
      <h1 className="text-2xl font-bold tracking-tight text-foreground">Add a business</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        You can fill in the rest of the profile — brand, audience, and goals — afterward.
      </p>
      <div className="glass mt-6 rounded-xl p-6">
        <NewBusinessForm workspaceSlug={workspaceSlug} />
      </div>
    </div>
  );
}
