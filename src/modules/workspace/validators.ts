/**
 * src/modules/workspace/validators.ts
 */
import { z } from "zod";

export const createWorkspaceSchema = z.object({
  name: z.string().trim().min(2, "Workspace name must be at least 2 characters").max(80, "Workspace name is too long"),
});
export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;

export const updateWorkspaceSchema = z.object({
  name: z.string().trim().min(2, "Workspace name must be at least 2 characters").max(80, "Workspace name is too long"),
});
export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceSchema>;
