/**
 * src/modules/activity/types.ts
 *
 * MODULE 4 NOTE: the brief refers to a universal "ActivityLog"
 * architecture as already existing. What actually exists in this
 * codebase is `AuditLog` (see prisma/schema.prisma) — workspace-scoped,
 * actor-attributed, action-stringed, with targetType/targetId/metadata.
 * That's functionally identical to what's being asked for, so this
 * module treats `AuditLog` AS the activity log rather than creating a
 * second, parallel table (`AuditLog` and `ActivityLog` would otherwise
 * end up being the exact same thing under two names — precisely the
 * "duplicate architecture" the brief prohibits).
 */

/** The complete, typed catalogue of Module 4 activity actions. Every call site imports this instead of typing a raw string, so the action taxonomy can't drift. */
export const ACTIVITY_ACTIONS = [
  "workspace.created",
  "workspace.updated",
  "workspace.archived",
  "workspace.restored",
  "business.created",
  "business.updated",
  "business.archived",
  "business.restored",
  "business.active_changed",
  "brand.updated",
  "member.invited",
  "member.invite_resent",
  "member.invite_revoked",
  "member.role_changed",
  "member.removed",
  "asset.uploaded",
  "asset.version_created",
  "asset.archived",
  "audience.created",
  "audience.updated",
  "audience.archived",
  "audience.primary_changed",
  "onboarding.completed",
  "ai_preferences.updated",
  "ai_preferences.reset",
  "ai_memory.created",
  "ai_memory.updated",
  "ai_memory.archived",
  "ai_memory.restored",
  "ai_memory.deleted",
] as const;

export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

export type ActivityTargetType =
  | "workspace"
  | "business"
  | "brand_identity"
  | "member"
  | "invite"
  | "asset"
  | "audience_segment"
  | "ai_preferences"
  | "ai_memory";

export interface ActivityLogEntry {
  id: string;
  workspaceId: string | null;
  actorId: string | null;
  actorName: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export interface ActivityQueryFilters {
  workspaceId?: string;
  actorId?: string;
  action?: string;
  targetType?: ActivityTargetType;
  targetId?: string;
  /** Business-scoped filtering — matched against metadata.businessId, since AuditLog itself is workspace-scoped, not business-scoped. */
  businessId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  page?: number;
  pageSize?: number;
}
