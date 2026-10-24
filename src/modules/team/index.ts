/**
 * src/modules/team/index.ts — public API of the team module.
 */
export type { WorkspaceMemberDTO, TeamInviteDTO } from "./types";
export { inviteMemberSchema, changeRoleSchema } from "./validators";
export type { InviteMemberInput, ChangeRoleInput } from "./validators";
export { listMembers, listPendingInvites, inviteMember, resendInvite, revokeInvite, acceptInvite, changeRole, removeMember } from "./service";
