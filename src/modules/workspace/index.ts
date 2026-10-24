/**
 * src/modules/workspace/index.ts — public API of the workspace module.
 */
export type { WorkspaceDTO, WorkspaceSummary } from "./types";
export { createWorkspaceSchema, updateWorkspaceSchema } from "./validators";
export type { CreateWorkspaceInput, UpdateWorkspaceInput } from "./validators";
export {
  createWorkspace,
  getWorkspaceBySlug,
  updateWorkspace,
  archiveWorkspace,
  restoreWorkspace,
  leaveWorkspace,
  listUserWorkspaces,
} from "./service";
