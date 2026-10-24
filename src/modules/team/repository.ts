/**
 * src/modules/team/repository.ts
 */
import { db } from "@/lib/db";
import type { WorkspaceRole, InviteStatus } from "@prisma/client";

export async function findPendingInviteByEmail(workspaceId: string, email: string) {
  return db.teamInvite.findFirst({ where: { workspaceId, email, status: "PENDING" } });
}

export async function createInvite(data: {
  workspaceId: string;
  email: string;
  role: WorkspaceRole;
  tokenHash: string;
  invitedById: string;
  expiresAt: Date;
}) {
  return db.teamInvite.create({ data });
}

export async function findInviteByTokenHash(tokenHash: string) {
  return db.teamInvite.findUnique({ where: { tokenHash } });
}

export async function findInviteById(id: string) {
  return db.teamInvite.findUnique({ where: { id }, include: { invitedBy: { select: { name: true } } } });
}

export async function listPendingInvites(workspaceId: string) {
  return db.teamInvite.findMany({
    where: { workspaceId, status: "PENDING" },
    include: { invitedBy: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function updateInvite(
  id: string,
  data: { status?: InviteStatus; tokenHash?: string; expiresAt?: Date; acceptedAt?: Date }
) {
  return db.teamInvite.update({ where: { id }, data });
}
