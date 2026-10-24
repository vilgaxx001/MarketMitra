# MarketMitra — RBAC System

## Overview

MarketMitra uses a two-tier role system: one platform-level role per user
(independent of any workspace), and one workspace-scoped role per
workspace membership.

## Role Tiers

### Platform roles (`User.platformRole`)

| Role | Scope | Description |
|------|-------|-------------|
| `SUPER_ADMIN` | Platform-wide | Full access to all workspaces, `/admin` panel, feature flags, billing oversight. Assigned manually in DB — never through the UI. |
| `USER` | Platform | Normal user. Actual permissions come from workspace memberships. |

### Workspace roles (`WorkspaceMember.role`)

| Role | Description |
|------|-------------|
| `ADMIN` | Full workspace control: billing, team management, settings, all projects. Typically the workspace owner and their designated administrators. |
| `TEAM_MEMBER` | Can generate AI content, create/edit/delete projects, view analytics. Cannot manage billing or invite/remove team members. |
| `CLIENT` | Read-only: can view projects and generated content that has been shared with them. Cannot generate content or access settings. |

A single `User` can be an `ADMIN` in their own workspace and a `CLIENT`
in a partner's workspace simultaneously — roles are per-membership, not
per-user globally.

## Permission Matrix

| Action | SUPER_ADMIN | ADMIN | TEAM_MEMBER | CLIENT |
|--------|:-----------:|:-----:|:-----------:|:------:|
| `content:generate` | ✓ | ✓ | ✓ | ✗ |
| `content:read` | ✓ | ✓ | ✓ | ✓ |
| `content:edit` | ✓ | ✓ | ✓ | ✗ |
| `content:delete` | ✓ | ✓ | ✓ | ✗ |
| `content:share` | ✓ | ✓ | ✓ | ✗ |
| `content:export` | ✓ | ✓ | ✓ | ✗ |
| `project:create` | ✓ | ✓ | ✓ | ✗ |
| `project:read` | ✓ | ✓ | ✓ | ✓ |
| `project:edit` | ✓ | ✓ | ✓ | ✗ |
| `project:delete` | ✓ | ✓ | ✓ | ✗ |
| `team:view` | ✓ | ✓ | ✓ | ✗ |
| `team:invite` | ✓ | ✓ | ✗ | ✗ |
| `team:remove` | ✓ | ✓ | ✗ | ✗ |
| `team:change-role` | ✓ | ✓ | ✗ | ✗ |
| `workspace:read` | ✓ | ✓ | ✓ | ✓ |
| `workspace:edit` | ✓ | ✓ | ✗ | ✗ |
| `workspace:delete` | ✓ | ✓ | ✗ | ✗ |
| `workspace:business-profile:edit` | ✓ | ✓ | ✗ | ✗ |
| `billing:view` | ✓ | ✓ | ✗ | ✗ |
| `billing:manage` | ✓ | ✓ | ✗ | ✗ |
| `analytics:view` | ✓ | ✓ | ✓ | ✗ |
| `admin:access` | ✓ | ✗ | ✗ | ✗ |
| `admin:users:manage` | ✓ | ✗ | ✗ | ✗ |
| `admin:billing:view` | ✓ | ✗ | ✗ | ✗ |
| `admin:feature-flags` | ✓ | ✗ | ✗ | ✗ |

## Usage

### In API routes

```typescript
import { requireWorkspaceAccess } from "@/lib/middleware/require-auth";
import { requirePermission } from "@/modules/rbac/permissions";

export const POST = withApiHandler(async (req, { params }) => {
  const workspaceUser = await requireWorkspaceAccess(params.workspaceSlug);
  await requirePermission(workspaceUser, "content:generate");
  // ... proceed with generation
});
```

### In Server Components (conditional rendering)

```typescript
import { getWorkspaceUserOrRedirect } from "@/lib/middleware/require-auth";
import { can } from "@/modules/rbac/permissions";

export default async function TeamPage({ params }) {
  const workspaceUser = await getWorkspaceUserOrRedirect(params.workspaceSlug);

  return (
    <div>
      <TeamList workspaceId={workspaceUser.workspaceId} />
      {can(workspaceUser, "team:invite") && <InviteMemberButton />}
      {can(workspaceUser, "billing:manage") && <BillingSettingsLink />}
    </div>
  );
}
```

### In Client Components

Client Components receive pre-resolved permission booleans as props from
their parent Server Component — they never call `can()` directly
(they don't have access to the `WorkspaceUser` object server-side).

```typescript
// Server Component parent
const canInvite = can(workspaceUser, "team:invite");
return <TeamMemberList canInvite={canInvite} />;

// Client Component child
function TeamMemberList({ canInvite }: { canInvite: boolean }) {
  return canInvite ? <InviteButton /> : null;
}
```

## Design decisions

**Why not client-side role checks?**
Client-side checks are UI hints only — any determined user can bypass
them by calling the API directly. The `can()` function is the actual
authorization gate; it always runs server-side in API routes or Server
Components.

**Why one function (`can`) instead of per-action helpers?**
One central function means one place to audit, one place to add a new
action, and consistent behaviour everywhere. The alternative (spread
checks across every component and route) creates the classic SaaS bug
where the UI hides a button but the API still allows the action.

**Why `SUPER_ADMIN` bypasses workspace checks entirely?**
SUPER_ADMIN is exclusively for the internal Anthropic/MarketMitra team
for support and operations. It's never assignable through the UI
(`platformRole` is not included in any user-facing API update endpoint)
and is applied directly in the database. The bypass is intentional and
documented, not an oversight.
