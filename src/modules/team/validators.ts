/**
 * src/modules/team/validators.ts
 */
import { z } from "zod";

export const inviteMemberSchema = z.object({
  email: z.string().trim().min(1).email("Enter a valid email address").toLowerCase(),
  role: z.enum(["ADMIN", "TEAM_MEMBER", "CLIENT"]),
});
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

export const changeRoleSchema = z.object({
  role: z.enum(["ADMIN", "TEAM_MEMBER", "CLIENT"]),
});
export type ChangeRoleInput = z.infer<typeof changeRoleSchema>;
