/**
 * src/modules/workspace/repository.ts
 *
 * All Prisma queries touching `db.workspace` and `db.workspaceMember`
 * live here and only here — see docs/ARCHITECTURE.md §2.
 */
import { db } from "@/lib/db";
import type { Prisma, WorkspaceRole } from "@prisma/client";

export async function findWorkspaceBySlug(slug: string) {
  return db.workspace.findUnique({ where: { slug } });
}

export async function findWorkspaceById(id: string) {
  return db.workspace.findUnique({ where: { id } });
}

export async function slugExists(slug: string): Promise<boolean> {
  const existing = await db.workspace.findUnique({ where: { slug }, select: { id: true } });
  return existing !== null;
}

export async function createWorkspace(data: { name: string; slug: string; ownerId: string }) {
  return db.workspace.create({ data });
}

export async function updateWorkspace(id: string, data: Prisma.WorkspaceUpdateInput) {
  return db.workspace.update({ where: { id }, data });
}

export async function setOnboardingStep(id: string, step: number) {
  return db.workspace.update({ where: { id }, data: { onboardingStep: step } });
}

export async function markOnboardingComplete(id: string) {
  return db.workspace.update({
    where: { id },
    data: { onboardingCompletedAt: new Date() },
  });
}

/** Every workspace a user belongs to, with their role and light aggregate counts — for the workspace switcher. */
export async function listWorkspacesForUser(userId: string) {
  return db.workspaceMember.findMany({
    where: { userId, workspace: { isActive: true } },
    include: {
      workspace: {
        include: {
          _count: { select: { members: true, businesses: { where: { isActive: true } } } },
        },
      },
    },
    orderBy: { joinedAt: "asc" },
  });
}

export async function countActiveMembers(workspaceId: string): Promise<number> {
  return db.workspaceMember.count({ where: { workspaceId } });
}

export async function findMembership(workspaceId: string, userId: string) {
  return db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
}

export async function createOwnerMembership(workspaceId: string, userId: string) {
  return db.workspaceMember.create({
    data: { workspaceId, userId, role: "ADMIN" },
  });
}

export async function listMembers(workspaceId: string) {
  return db.workspaceMember.findMany({
    where: { workspaceId },
    include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
    orderBy: { joinedAt: "asc" },
  });
}

export async function countAdmins(workspaceId: string): Promise<number> {
  return db.workspaceMember.count({ where: { workspaceId, role: "ADMIN" } });
}

export async function updateMemberRole(workspaceId: string, userId: string, role: WorkspaceRole) {
  return db.workspaceMember.update({
    where: { workspaceId_userId: { workspaceId, userId } },
    data: { role },
  });
}

export async function removeMember(workspaceId: string, userId: string) {
  return db.workspaceMember.delete({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
}
