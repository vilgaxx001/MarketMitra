/**
 * src/app/(app)/[workspaceSlug]/layout.tsx
 *
 * The authenticated app shell — first real implementation of this route
 * group (Modules 1-3 built the Sidebar component, RBAC, and auth, but no
 * module before this one had a workspace-scoped page to assemble them
 * into). Resolves workspace access (redirecting to /login or /dashboard
 * on failure — see getWorkspaceUserOrRedirect), the user's full
 * workspace list (for the switcher), and the active business.
 */
import { Sidebar } from "@/components/layout/sidebar";
import { WorkspaceSwitcher } from "@/components/workspace/workspace-switcher";
import { BusinessSwitcher } from "@/components/workspace/business-switcher";
import { getWorkspaceUserOrRedirect } from "@/lib/middleware/require-auth";
import { resolveActiveBusiness } from "@/lib/middleware/require-business";
import { listUserWorkspaces } from "@/modules/workspace/service";
import { listBusinesses } from "@/modules/business/service";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const workspaceUser = await getWorkspaceUserOrRedirect(workspaceSlug);

  const [workspaces, businesses, activeBusiness] = await Promise.all([
    listUserWorkspaces(workspaceUser.id),
    listBusinesses(workspaceUser.workspaceId),
    resolveActiveBusiness(workspaceUser),
  ]);

  const currentWorkspace = workspaces.find((w) => w.slug === workspaceSlug);

  return (
    <div className="flex min-h-dvh bg-background">
      <Sidebar
        workspaceSlug={workspaceSlug}
        workspaceName={currentWorkspace?.name ?? workspaceSlug}
        userName={workspaceUser.name}
        userAvatarUrl={workspaceUser.avatarUrl}
        userRole={workspaceUser.workspaceRole}
      />

      <div className="flex flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-border px-6">
          <div className="flex items-center gap-3">
            <WorkspaceSwitcher
              current={{ name: currentWorkspace?.name ?? workspaceSlug, slug: workspaceSlug }}
              workspaces={workspaces}
            />
            <span className="text-muted-foreground">/</span>
            <BusinessSwitcher
              workspaceSlug={workspaceSlug}
              current={activeBusiness ? { id: activeBusiness.id, businessName: activeBusiness.businessName } : null}
              businesses={businesses}
            />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
