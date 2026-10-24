/**
 * src/modules/team/types.ts
 */
import type { WorkspaceRole, InviteStatus } from "@prisma/client";

export interface WorkspaceMemberDTO {
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: WorkspaceRole;
  joinedAt: Date;
}

export interface TeamInviteDTO {
  id: string;
  email: string;
  role: WorkspaceRole;
  status: InviteStatus;
  invitedByName: string;
  expiresAt: Date;
  createdAt: Date;
}
