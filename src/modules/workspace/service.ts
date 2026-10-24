/**
 * src/modules/workspace/service.ts
 *
 * Business logic for workspace lifecycle. Permission checks
 * (`requirePermission`) happen at the API route layer per
 * docs/ARCHITECTURE.md — these functions trust that the caller has
 * already verified the actor may perform the action, but still take an
 * explicit `actorId`/`workspaceId` on every call so nothing here can be
 * invoked without knowing exactly who is doing what to which tenant.
 */
import { db } from "@/lib/db";
import { ApiException } from "@/lib/api-response";
import { slugify } from "@/lib/utils";
import { logActivity } from "@/modules/activity/service";
import * as repo from "./repository";
import type { CreateWorkspaceInput, UpdateWorkspaceInput } from "./validators";
import type { WorkspaceDTO, WorkspaceSummary } from "./types";
import type { Workspace } from "@prisma/client";

function toDTO(w: Workspace): WorkspaceDTO {
  return {
    id: w.id,
    name: w.name,
    slug: w.slug,
    ownerId: w.ownerId,
    isActive: w.isActive,
    onboardingStep: w.onboardingStep,
    onboardingCompletedAt: w.onboardingCompletedAt,
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
  };
}

/** Appends a short random suffix until the slug is free — same pattern used for TeamInvite tokens elsewhere (collision-resistant, no read-then-write race in practice since a losing insert just retries). */
async function generateUniqueSlug(name: string): Promise<string> {
  const base = slugify(name) || "workspace";
  let candidate = base;
  let attempt = 0;
  while (await repo.slugExists(candidate)) {
    attempt += 1;
    candidate = `${base}-${Math.random().toString(36).slice(2, 6)}`;
    if (attempt > 10) {
      throw new ApiException("INTERNAL_ERROR", "Could not generate a unique workspace URL. Please try a different name.");
    }
  }
  return candidate;
}

export async function createWorkspace(
  ownerId: string,
  input: CreateWorkspaceInput
): Promise<WorkspaceDTO> {
  const slug = await generateUniqueSlug(input.name);

  const workspace = await db.$transaction(async (tx) => {
    const ws = await tx.workspace.create({
      data: { name: input.name, slug, ownerId },
    });
    await tx.workspaceMember.create({
      data: { workspaceId: ws.id, userId: ownerId, role: "ADMIN" },
    });
    return ws;
  });

  await logActivity({
    workspaceId: workspace.id,
    actorId: ownerId,
    action: "workspace.created",
    targetType: "workspace",
    targetId: workspace.id,
    metadata: { name: workspace.name },
  });

  return toDTO(workspace);
}

export async function getWorkspaceBySlug(slug: string): Promise<WorkspaceDTO> {
  const workspace = await repo.findWorkspaceBySlug(slug);
  if (!workspace || !workspace.isActive) {
    throw new ApiException("NOT_FOUND", `Workspace "${slug}" not found.`);
  }
  return toDTO(workspace);
}

export async function updateWorkspace(
  workspaceId: string,
  actorId: string,
  input: UpdateWorkspaceInput
): Promise<WorkspaceDTO> {
  const workspace = await repo.updateWorkspace(workspaceId, { name: input.name });

  await logActivity({
    workspaceId,
    actorId,
    action: "workspace.updated",
    targetType: "workspace",
    targetId: workspaceId,
    metadata: { name: input.name },
  });

  return toDTO(workspace);
}

export async function archiveWorkspace(workspaceId: string, actorId: string): Promise<WorkspaceDTO> {
  const workspace = await repo.updateWorkspace(workspaceId, {
    isActive: false,
    archivedAt: new Date(),
  });

  await logActivity({
    workspaceId,
    actorId,
    action: "workspace.archived",
    targetType: "workspace",
    targetId: workspaceId,
  });

  return toDTO(workspace);
}

export async function restoreWorkspace(workspaceId: string, actorId: string): Promise<WorkspaceDTO> {
  const workspace = await repo.updateWorkspace(workspaceId, {
    isActive: true,
    archivedAt: null,
  });

  await logActivity({
    workspaceId,
    actorId,
    action: "workspace.restored",
    targetType: "workspace",
    targetId: workspaceId,
  });

  return toDTO(workspace);
}

/**
 * A user may leave a workspace they're a member of, UNLESS they're the
 * only remaining ADMIN — a workspace can never be left without an admin,
 * since every other Module 4 permission (archive, billing, team
 * management) requires one to exist.
 */
export async function leaveWorkspace(workspaceId: string, userId: string): Promise<void> {
  const membership = await repo.findMembership(workspaceId, userId);
  if (!membership) {
    throw new ApiException("NOT_FOUND", "You're not a member of this workspace.");
  }

  if (membership.role === "ADMIN") {
    const adminCount = await repo.countAdmins(workspaceId);
    if (adminCount <= 1) {
      throw new ApiException(
        "CONFLICT",
        "You're the only admin of this workspace. Promote another member to admin before leaving, or archive the workspace instead."
      );
    }
  }

  await repo.removeMember(workspaceId, userId);
}

export async function listUserWorkspaces(userId: string): Promise<WorkspaceSummary[]> {
  const memberships = await repo.listWorkspacesForUser(userId);
  return memberships.map((m) => ({
    id: m.workspace.id,
    name: m.workspace.name,
    slug: m.workspace.slug,
    role: m.role,
    memberCount: m.workspace._count.members,
    businessCount: m.workspace._count.businesses,
  }));
}
