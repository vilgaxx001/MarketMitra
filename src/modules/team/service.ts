/**
 * src/modules/team/service.ts
 *
 * Invitation tokens follow the exact same pattern as auth/service.ts's
 * email-verification/password-reset tokens (nanoid(48) raw value,
 * SHA-256 hash persisted, raw value only ever exists in the email link)
 * — reimplemented locally rather than importing auth/service.ts's
 * private helpers (they're not exported, and this is a completely
 * generic 3-line pattern, not a subsystem worth coupling two modules
 * over).
 */
import { nanoid } from "nanoid";
import { createHash } from "crypto";
import { env } from "@/lib/env";
import { db } from "@/lib/db";
import { ApiException } from "@/lib/api-response";
import { sendEmail, emailTemplates } from "@/lib/email";
import { logActivity } from "@/modules/activity/service";
import * as workspaceRepo from "@/modules/workspace/repository";
import * as repo from "./repository";
import type { InviteMemberInput } from "./validators";
import type { WorkspaceMemberDTO, TeamInviteDTO } from "./types";
import type { WorkspaceRole } from "@prisma/client";

const INVITE_EXPIRY_DAYS = 7;

function generateSecureToken(): string {
  return nanoid(48);
}
function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}
function expiresInDays(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

export async function listMembers(workspaceId: string): Promise<WorkspaceMemberDTO[]> {
  const members = await workspaceRepo.listMembers(workspaceId);
  return members.map((m) => ({
    userId: m.userId,
    name: m.user.name,
    email: m.user.email,
    avatarUrl: m.user.avatarUrl,
    role: m.role,
    joinedAt: m.joinedAt,
  }));
}

export async function listPendingInvites(workspaceId: string): Promise<TeamInviteDTO[]> {
  const invites = await repo.listPendingInvites(workspaceId);
  return invites.map((i) => ({
    id: i.id,
    email: i.email,
    role: i.role,
    status: i.status,
    invitedByName: i.invitedBy.name,
    expiresAt: i.expiresAt,
    createdAt: i.createdAt,
  }));
}

export async function inviteMember(
  workspaceId: string,
  workspaceName: string,
  inviterUserId: string,
  inviterName: string,
  input: InviteMemberInput
): Promise<TeamInviteDTO> {
  const existingMember = await workspaceRepo.listMembers(workspaceId);
  if (existingMember.some((m) => m.user.email === input.email)) {
    throw new ApiException("CONFLICT", "This person is already a member of the workspace.");
  }

  const existingInvite = await repo.findPendingInviteByEmail(workspaceId, input.email);
  if (existingInvite) {
    throw new ApiException("CONFLICT", "There's already a pending invitation for this email. Resend it instead of creating a new one.");
  }

  const rawToken = generateSecureToken();
  const invite = await repo.createInvite({
    workspaceId,
    email: input.email,
    role: input.role,
    tokenHash: hashToken(rawToken),
    invitedById: inviterUserId,
    expiresAt: expiresInDays(INVITE_EXPIRY_DAYS),
  });

  const inviteUrl = `${env.APP_URL}/invite/${rawToken}`;
  const template = emailTemplates.teamInvite({
    inviteeName: input.email.split("@")[0] ?? input.email,
    workspaceName,
    inviterName,
    role: input.role,
    inviteUrl,
  });
  // Non-blocking — an invite row existing is the source of truth; email
  // delivery failure shouldn't fail the whole request (mirrors the
  // pattern already used for verification emails in auth/service.ts).
  sendEmail({ ...template, to: input.email }).catch(() => {
    // Errors are logged inside sendEmail() itself.
  });

  await logActivity({
    workspaceId,
    actorId: inviterUserId,
    action: "member.invited",
    targetType: "invite",
    targetId: invite.id,
    metadata: { email: input.email, role: input.role },
  });

  return {
    id: invite.id,
    email: invite.email,
    role: invite.role,
    status: invite.status,
    invitedByName: inviterName,
    expiresAt: invite.expiresAt,
    createdAt: invite.createdAt,
  };
}

export async function resendInvite(inviteId: string, workspaceId: string, actorId: string, workspaceName: string, inviterName: string): Promise<void> {
  const invite = await repo.findInviteById(inviteId);
  if (!invite || invite.workspaceId !== workspaceId) {
    throw new ApiException("NOT_FOUND", "Invitation not found.");
  }
  if (invite.status !== "PENDING") {
    throw new ApiException("CONFLICT", `This invitation is ${invite.status.toLowerCase()} and can't be resent.`);
  }

  const rawToken = generateSecureToken();
  await repo.updateInvite(inviteId, {
    tokenHash: hashToken(rawToken),
    expiresAt: expiresInDays(INVITE_EXPIRY_DAYS),
  });

  const inviteUrl = `${env.APP_URL}/invite/${rawToken}`;
  const template = emailTemplates.teamInvite({
    inviteeName: invite.email.split("@")[0] ?? invite.email,
    workspaceName,
    inviterName,
    role: invite.role,
    inviteUrl,
  });
  sendEmail({ ...template, to: invite.email }).catch(() => {});

  await logActivity({
    workspaceId,
    actorId,
    action: "member.invite_resent",
    targetType: "invite",
    targetId: inviteId,
    metadata: { email: invite.email },
  });
}

export async function revokeInvite(inviteId: string, workspaceId: string, actorId: string): Promise<void> {
  const invite = await repo.findInviteById(inviteId);
  if (!invite || invite.workspaceId !== workspaceId) {
    throw new ApiException("NOT_FOUND", "Invitation not found.");
  }
  if (invite.status !== "PENDING") {
    throw new ApiException("CONFLICT", `This invitation is already ${invite.status.toLowerCase()}.`);
  }

  await repo.updateInvite(inviteId, { status: "REVOKED" });

  await logActivity({
    workspaceId,
    actorId,
    action: "member.invite_revoked",
    targetType: "invite",
    targetId: inviteId,
    metadata: { email: invite.email },
  });
}

/**
 * Accepts an invitation. Requires an authenticated caller whose email
 * matches the invite exactly — this is what prevents someone from
 * forwarding an invite link to a different email address and joining as
 * whoever the invite was addressed to.
 */
export async function acceptInvite(rawToken: string, currentUserId: string, currentUserEmail: string): Promise<{ workspaceId: string; workspaceSlug: string }> {
  const tokenHash = hashToken(rawToken);
  const invite = await repo.findInviteByTokenHash(tokenHash);

  if (!invite) {
    throw new ApiException("NOT_FOUND", "This invitation link is invalid.");
  }
  if (invite.status === "ACCEPTED") {
    throw new ApiException("CONFLICT", "This invitation has already been accepted.");
  }
  if (invite.status === "REVOKED") {
    throw new ApiException("CONFLICT", "This invitation has been revoked.");
  }
  if (invite.status === "EXPIRED" || invite.expiresAt < new Date()) {
    if (invite.status !== "EXPIRED") await repo.updateInvite(invite.id, { status: "EXPIRED" });
    throw new ApiException("CONFLICT", "This invitation has expired. Ask the workspace admin to resend it.");
  }
  if (invite.email !== currentUserEmail) {
    throw new ApiException(
      "FORBIDDEN",
      "This invitation was sent to a different email address. Log in with that email to accept it."
    );
  }

  const existingMembership = await workspaceRepo.findMembership(invite.workspaceId, currentUserId);
  const workspace = await workspaceRepo.findWorkspaceById(invite.workspaceId);
  if (!workspace) throw new ApiException("NOT_FOUND", "Workspace no longer exists.");

  if (existingMembership) {
    await repo.updateInvite(invite.id, { status: "ACCEPTED", acceptedAt: new Date() });
    return { workspaceId: invite.workspaceId, workspaceSlug: workspace.slug };
  }

  await db.$transaction([
    db.workspaceMember.create({ data: { workspaceId: invite.workspaceId, userId: currentUserId, role: invite.role } }),
    db.teamInvite.update({ where: { id: invite.id }, data: { status: "ACCEPTED", acceptedAt: new Date() } }),
  ]);

  return { workspaceId: invite.workspaceId, workspaceSlug: workspace.slug };
}

export async function changeRole(workspaceId: string, targetUserId: string, actorId: string, role: WorkspaceRole): Promise<void> {
  const membership = await workspaceRepo.findMembership(workspaceId, targetUserId);
  if (!membership) throw new ApiException("NOT_FOUND", "Member not found.");

  if (membership.role === "ADMIN" && role !== "ADMIN") {
    const adminCount = await workspaceRepo.countAdmins(workspaceId);
    if (adminCount <= 1) {
      throw new ApiException("CONFLICT", "This is the only admin — promote someone else to admin first.");
    }
  }

  await workspaceRepo.updateMemberRole(workspaceId, targetUserId, role);

  await logActivity({
    workspaceId,
    actorId,
    action: "member.role_changed",
    targetType: "member",
    targetId: targetUserId,
    metadata: { targetUserId, newRole: role },
  });
}

export async function removeMember(workspaceId: string, targetUserId: string, actorId: string): Promise<void> {
  const membership = await workspaceRepo.findMembership(workspaceId, targetUserId);
  if (!membership) throw new ApiException("NOT_FOUND", "Member not found.");

  if (membership.role === "ADMIN") {
    const adminCount = await workspaceRepo.countAdmins(workspaceId);
    if (adminCount <= 1) {
      throw new ApiException("CONFLICT", "You can't remove the only admin. Promote someone else first.");
    }
  }

  await workspaceRepo.removeMember(workspaceId, targetUserId);

  await logActivity({
    workspaceId,
    actorId,
    action: "member.removed",
    targetType: "member",
    targetId: targetUserId,
    metadata: { targetUserId },
  });
}
