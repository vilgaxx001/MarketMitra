/**
 * src/modules/workspace/types.ts
 */
import type { WorkspaceRole } from "@prisma/client";

export interface WorkspaceDTO {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  isActive: boolean;
  onboardingStep: number;
  onboardingCompletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Lightweight shape for the workspace switcher — one row per workspace the current user belongs to. */
export interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  role: WorkspaceRole;
  memberCount: number;
  businessCount: number;
}
