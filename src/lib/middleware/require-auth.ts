/**
 * src/lib/middleware/require-auth.ts
 *
 * Server-side auth helpers called at the top of every authenticated
 * Server Component and API route handler.
 *
 * SECURITY MODEL (read this before changing anything here):
 *   Identity is established ONLY from the signed session cookie, verified here with the server secret, and then
 *   confirmed against the database. NOTHING that arrives in a request header is ever treated as identity: the
 *   x-user-id / x-session-id / x-user-email / x-platform-role headers an earlier design injected from middleware
 *   were forgeable on any request that middleware did not overwrite (no cookie, invalid/expired/tampered cookie),
 *   which let a client pick its own platform role (SUPER_ADMIN) and cross every tenant boundary. They are no
 *   longer read anywhere, and middleware deletes them from every request it forwards (src/middleware.ts).
 *   Role, email and account state come from the User row joined to the live Session row, never from the JWT
 *   claims (which can be stale after a demotion) and never from a header.
 *
 * THREE LEVELS OF AUTH CHECKING:
 *
 * 1. requireAuth()
 *    → Verifies the session cookie's JWT signature/expiry, then requires the matching server-side session row
 *      (so logout / password change revoke it) AND an active user. Returns SessionPayload whose role/email are the
 *      DATABASE's current values. Use when you only need "who is this user" without a workspace context.
 *
 * 2. requireAuthUser()
 *    → requireAuth() + fetches full User row from DB (name, avatar, email-verified status).
 *
 * 3. requireWorkspaceAccess(workspaceSlug)
 *    → requireAuth() + fetches WorkspaceMember row for this user+workspace.
 *      Returns WorkspaceUser (AuthUser + workspaceId + workspaceRole).
 *      Use in every workspace-scoped page and API route — this is the primary entry point into the RBAC system.
 *
 * All three throw ApiException("UNAUTHENTICATED") if the session is invalid, which withApiHandler() converts to a
 * 401 response. In Server Components, call these inside try/catch and redirect to /login on UNAUTHENTICATED (see
 * getAuthOrRedirect / getWorkspaceUserOrRedirect below).
 *
 * PERFORMANCE: requireAuth adds ONE indexed query (sessions JOIN users, by primary key). requireWorkspaceAccess then
 * makes one more (WorkspaceMember JOIN User JOIN Workspace). Middleware (edge, no DB) still verifies the JWT for the
 * coarse redirect rules, but its result is not passed to handlers.
 */

import { redirect } from "next/navigation";
import { ApiException } from "@/lib/api-response";
import { getSessionCookie, verifySessionToken } from "@/modules/auth/session";
import { resolveActiveSessionIdentity } from "@/modules/auth/service";
import { db } from "@/lib/db";
import type { SessionPayload, AuthUser, WorkspaceUser } from "@/modules/auth/types";

/* -------------------------------------------------------------------------
 * 1. requireAuth — verified cookie JWT + live session row + active user (role from the DB)
 * ---------------------------------------------------------------------- */

const unauthenticated = () => new ApiException("UNAUTHENTICATED", "You must be signed in to access this.");

export async function requireAuth(): Promise<SessionPayload> {
  const token = await getSessionCookie();
  if (!token) throw unauthenticated();

  // Signature, issuer, audience, algorithm and expiry are all checked by verifySessionToken; null on any failure.
  const claims = await verifySessionToken(token);
  if (!claims || typeof claims.sessionId !== "string" || typeof claims.userId !== "string" || !claims.sessionId || !claims.userId) {
    throw unauthenticated();
  }

  // The JWT only proves the token was once issued. The session row must still exist (logout / password change / reset
  // delete it), belong to this user, be unexpired, and the user must still be active. Role and email are the DB's values.
  const live = await resolveActiveSessionIdentity(claims.sessionId, claims.userId);
  if (!live) throw unauthenticated();

  return { sessionId: live.sessionId, userId: live.userId, email: live.email, platformRole: live.platformRole, exp: claims.exp };
}

/* -------------------------------------------------------------------------
 * 2. requireAuthUser — session + full User row
 * ---------------------------------------------------------------------- */

export async function requireAuthUser(): Promise<AuthUser> {
  const session = await requireAuth();

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      email: true,
      name: true,
      avatarUrl: true,
      platformRole: true,
      emailVerifiedAt: true,
      isActive: true,
    },
  });

  if (!user || !user.isActive) {
    throw new ApiException("UNAUTHENTICATED", "Your account is not active. Please contact support.");
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    platformRole: user.platformRole,
    emailVerifiedAt: user.emailVerifiedAt,
  };
}

/* -------------------------------------------------------------------------
 * 3. requireWorkspaceAccess — session + workspace membership + role
 * ---------------------------------------------------------------------- */

export async function requireWorkspaceAccess(workspaceSlug: string): Promise<WorkspaceUser> {
  const session = await requireAuth();

  // SUPER_ADMIN gets access to every workspace without a membership row. The returned identity is the SUPER_ADMIN's OWN:
  // every caller uses `.id` as the actor for audit logs, createdBy/updatedBy columns and membership operations (leave,
  // role changes), so returning the workspace OWNER here (as an earlier version did) mis-attributed every SUPER_ADMIN
  // action to the owner and made POST /leave remove the owner's membership.
  if (session.platformRole === "SUPER_ADMIN") {
    const [workspace, self] = await Promise.all([
      db.workspace.findUnique({ where: { slug: workspaceSlug }, select: { id: true } }),
      db.user.findUnique({
        where: { id: session.userId },
        select: { id: true, email: true, name: true, avatarUrl: true, emailVerifiedAt: true },
      }),
    ]);
    if (!self) throw unauthenticated();
    if (!workspace) {
      throw new ApiException("NOT_FOUND", `Workspace "${workspaceSlug}" not found.`);
    }
    return {
      id: self.id,
      email: self.email,
      name: self.name,
      avatarUrl: self.avatarUrl,
      platformRole: "SUPER_ADMIN",
      emailVerifiedAt: self.emailVerifiedAt,
      workspaceId: workspace.id,
      workspaceRole: "ADMIN", // SUPER_ADMIN gets admin-equivalent access
    };
  }

  // Regular users — look up their WorkspaceMember row
  const membership = await db.workspaceMember.findFirst({
    where: {
      userId: session.userId,
      workspace: { slug: workspaceSlug, isActive: true },
    },
    include: {
      user: true,
      workspace: true,
    },
  });

  if (!membership) {
    throw new ApiException(
      "FORBIDDEN",
      `You don't have access to this workspace, or it doesn't exist.`
    );
  }

  return {
    id: membership.user.id,
    email: membership.user.email,
    name: membership.user.name,
    avatarUrl: membership.user.avatarUrl,
    platformRole: membership.user.platformRole,
    emailVerifiedAt: membership.user.emailVerifiedAt,
    workspaceId: membership.workspaceId,
    workspaceRole: membership.role,
  };
}

/* -------------------------------------------------------------------------
 * Server Component convenience — redirects instead of throwing.
 * Use in page.tsx layouts where you want redirect-on-unauthenticated
 * rather than an error response.
 * ---------------------------------------------------------------------- */

export async function getAuthOrRedirect(redirectTo = "/login"): Promise<SessionPayload> {
  try {
    return await requireAuth();
  } catch {
    redirect(redirectTo);
  }
}

export async function getWorkspaceUserOrRedirect(
  workspaceSlug: string,
  redirectTo = "/login"
): Promise<WorkspaceUser> {
  try {
    return await requireWorkspaceAccess(workspaceSlug);
  } catch (err) {
    if (err instanceof ApiException && err.code === "UNAUTHENTICATED") {
      redirect(`${redirectTo}?redirect=/${workspaceSlug}/dashboard`);
    }
    // FORBIDDEN — they're logged in but don't belong to this workspace
    redirect("/dashboard");
  }
}
