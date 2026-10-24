/**
 * src/modules/rbac/permissions.ts
 *
 * Role-Based Access Control — the complete permission matrix for
 * MarketMitra's four-role system.
 *
 * ROLES (from schema.prisma):
 *   Platform level (on User.platformRole):
 *     SUPER_ADMIN — full platform access, /admin panel, cross-workspace visibility
 *     USER        — normal user, permissions determined by workspace role
 *
 *   Workspace level (on WorkspaceMember.role):
 *     ADMIN       — full workspace control: billing, team, settings, all projects
 *     TEAM_MEMBER — generate content, manage own projects. No billing/team access.
 *     CLIENT      — read-only: view shared projects/content. No generation.
 *
 * USAGE:
 *   import { can } from "@/modules/rbac/permissions";
 *
 *   // In a Server Component or API route:
 *   if (!can(workspaceUser, "billing:manage")) throw new ApiException("FORBIDDEN", "...");
 *
 *   // In a Server Component for conditional rendering:
 *   {can(workspaceUser, "team:invite") && <InviteMemberButton />}
 */

import type { WorkspaceUser } from "@/modules/auth/types";
import type { PlatformRole, WorkspaceRole } from "@prisma/client";

/* -------------------------------------------------------------------------
 * Action strings — the full catalogue of things that can be done.
 * Format: "domain:verb"
 * ---------------------------------------------------------------------- */
export type Action =
  // Content generation
  | "content:generate"
  | "ai:execute"
  | "content:read"
  | "content:edit"
  | "content:delete"
  | "content:share"
  | "content:export"
  // Projects
  | "project:create"
  | "project:read"
  | "project:edit"
  | "project:delete"
  // Team
  | "team:view"
  | "team:invite"
  | "team:remove"
  | "team:change-role"
  // Workspace
  | "workspace:read"
  | "workspace:edit"
  | "workspace:delete"
  | "workspace:archive"
  // Business (Module 4 — multi-business)
  | "business:create"
  | "business:read"
  | "business:edit"
  | "business:archive"
  // Brand identity (Module 4)
  | "brand:read"
  | "brand:edit"
  // Business AI preferences (Module 5B.1) — shape AI output for the whole business
  | "ai-preferences:read"
  | "ai-preferences:edit"
  // Business AI memory (Module 5B.2) — durable business knowledge records
  | "ai-memory:read"
  | "ai-memory:create"
  | "ai-memory:edit"
  | "ai-memory:delete"
  // Target audience segments (Module 4)
  | "audience:create"
  | "audience:read"
  | "audience:edit"
  | "audience:archive"
  // Brand/file assets (Module 4)
  | "asset:create"
  | "asset:read"
  | "asset:delete"
  // Activity log (Module 4 — read access to the workspace's own audit trail)
  | "activity:read"
  // Billing
  | "billing:view"
  | "billing:manage"
  // Analytics
  | "analytics:view"
  // Admin (platform level)
  | "admin:access"
  | "admin:users:manage"
  | "admin:billing:view"
  | "admin:feature-flags";

/* -------------------------------------------------------------------------
 * Permission matrix
 *
 * Workspace roles inherit downward: ADMIN can do everything TEAM_MEMBER
 * can, plus billing/team actions. CLIENT can only read.
 *
 * SUPER_ADMIN bypasses all workspace-level checks — handled separately
 * in the `can()` function below.
 * ---------------------------------------------------------------------- */
const WORKSPACE_PERMISSIONS: Record<WorkspaceRole, Set<Action>> = {
  ADMIN: new Set<Action>([
    "content:generate",
    "ai:execute",
    "content:read",
    "content:edit",
    "content:delete",
    "content:share",
    "content:export",
    "project:create",
    "project:read",
    "project:edit",
    "project:delete",
    "team:view",
    "team:invite",
    "team:remove",
    "team:change-role",
    "workspace:read",
    "workspace:edit",
    "workspace:delete",
    "workspace:archive",
    "business:create",
    "business:read",
    "business:edit",
    "business:archive",
    "brand:read",
    "brand:edit",
    "ai-preferences:read",
    "ai-preferences:edit",
    "ai-memory:read",
    "ai-memory:create",
    "ai-memory:edit",
    "ai-memory:delete",
    "audience:create",
    "audience:read",
    "audience:edit",
    "audience:archive",
    "asset:create",
    "asset:read",
    "asset:delete",
    "activity:read",
    "billing:view",
    "billing:manage",
    "analytics:view",
  ]),
  TEAM_MEMBER: new Set<Action>([
    "content:generate",
    "ai:execute",
    "content:read",
    "content:edit",
    "content:delete",
    "content:share",
    "content:export",
    "project:create",
    "project:read",
    "project:edit",
    "project:delete",
    "team:view",
    "workspace:read",
    "business:read",
    "brand:read",
    "ai-preferences:read",
    "ai-memory:read",
    "audience:create",
    "audience:read",
    "audience:edit",
    "asset:create",
    "asset:read",
    "activity:read",
    "analytics:view",
  ]),
  CLIENT: new Set<Action>([
    "content:read",
    "project:read",
    "workspace:read",
    "business:read",
    "brand:read",
  ]),
};

const PLATFORM_PERMISSIONS: Record<PlatformRole, Set<Action>> = {
  SUPER_ADMIN: new Set<Action>([
    "admin:access",
    "admin:users:manage",
    "admin:billing:view",
    "admin:feature-flags",
  ]),
  USER: new Set<Action>(),
};

/* -------------------------------------------------------------------------
 * Guard function — the single, centralised permission check.
 *
 * Used identically in:
 *   1. src/middleware.ts — route-level guard before a page renders
 *   2. Server Components — conditional rendering (hide/show UI elements)
 *   3. API routes — actual authorisation before mutating data
 *
 * Centralising here is what prevents the common SaaS bug where the UI
 * hides a button but the API still allows the action if called directly.
 * ---------------------------------------------------------------------- */
export function can(user: WorkspaceUser, action: Action): boolean {
  // SUPER_ADMIN bypasses all workspace-level restrictions
  if (user.platformRole === "SUPER_ADMIN") return true;

  // Platform-level admin actions
  if (
    action.startsWith("admin:") &&
    PLATFORM_PERMISSIONS[user.platformRole]?.has(action)
  ) {
    return true;
  }

  // Workspace-level actions
  return WORKSPACE_PERMISSIONS[user.workspaceRole]?.has(action) ?? false;
}

/**
 * Throws an ApiException if the user doesn't have permission.
 * Use in API routes for concise one-liner guards.
 *
 * USAGE:
 *   await requirePermission(workspaceUser, "billing:manage");
 */
export async function requirePermission(
  user: WorkspaceUser,
  action: Action,
  message?: string
): Promise<void> {
  if (!can(user, action)) {
    const { ApiException } = await import("@/lib/api-response");
    throw new ApiException(
      "FORBIDDEN",
      message ?? `You don't have permission to perform this action.`
    );
  }
}
