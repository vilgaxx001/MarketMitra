/**
 * src/modules/auth/types.ts
 *
 * Types shared by the auth service, repository, API routes, and UI
 * components. Never import Prisma types directly in UI — use these
 * mapped types instead, so the database schema can evolve without
 * breaking component interfaces.
 */

import type { PlatformRole } from "@prisma/client";

/* -------------------------------------------------------------------------
 * Session payload — stored as a signed JWT in an HttpOnly cookie.
 * Keep this lean: only what's needed to serve a request without a DB
 * lookup. Profile info (name, avatar) is fetched separately when needed.
 * ---------------------------------------------------------------------- */
export interface SessionPayload {
  sessionId: string;
  userId: string;
  email: string;
  platformRole: PlatformRole;
  /** Expiry as a Unix timestamp (seconds). Checked server-side on every request. */
  exp: number;
}

/* -------------------------------------------------------------------------
 * Authenticated user — the shape returned by requireAuth() middleware
 * and available in every authenticated Server Component / API route.
 * ---------------------------------------------------------------------- */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  platformRole: PlatformRole;
  emailVerifiedAt: Date | null;
}

/* -------------------------------------------------------------------------
 * Workspace-scoped identity — augments AuthUser with the caller's role
 * within a specific workspace. Used by RBAC guards.
 * ---------------------------------------------------------------------- */
export interface WorkspaceUser extends AuthUser {
  workspaceId: string;
  workspaceRole: import("@prisma/client").WorkspaceRole;
}

/* -------------------------------------------------------------------------
 * Token metadata stored in DB for email verification / password reset.
 * ---------------------------------------------------------------------- */
export interface TokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
}
