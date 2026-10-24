/**
 * src/lib/middleware/require-business.ts
 *
 * The "active business" counterpart to requireWorkspaceAccess() in
 * require-auth.ts. Every module beyond Module 4 (AI Core, Marketing
 * Agents, Content Generation, etc.) that needs "which business is the
 * user currently working in" resolves it through here — not by reading
 * a client-supplied businessId directly.
 *
 * SECURITY MODEL:
 *   The "active business" is a per-(user, workspace) UX preference, not
 *   an authorization boundary — so it's stored in a plain (not
 *   cryptographically signed) HttpOnly cookie, scoped per workspace so
 *   switching workspaces doesn't clobber which business was selected in
 *   another one. That cookie is ONLY ever treated as "which business to
 *   try first." Every read re-verifies the business belongs to the
 *   resolved workspace and is active before trusting it — a tampered or
 *   stale cookie value just falls through to "no valid active business
 *   found," never to cross-tenant access. This is what "browser state
 *   must never be the security authority" means in practice here.
 */
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { ApiException } from "@/lib/api-response";
import * as businessRepo from "@/modules/business/repository";
import type { WorkspaceUser } from "@/modules/auth/types";
import type { BusinessProfile } from "@prisma/client";

function activeBusinessCookieName(workspaceId: string): string {
  return `mm_active_business_${workspaceId}`;
}

const COOKIE_BASE_OPTIONS = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 365, // 1 year — it's a UX preference, not a session
};

export async function setActiveBusinessCookie(workspaceId: string, businessId: string): Promise<void> {
  const store = await cookies();
  store.set(activeBusinessCookieName(workspaceId), businessId, COOKIE_BASE_OPTIONS);
}

async function getActiveBusinessCookie(workspaceId: string): Promise<string | undefined> {
  const store = await cookies();
  return store.get(activeBusinessCookieName(workspaceId))?.value;
}

/**
 * Resolves "the business the user is currently working in" within a
 * workspace they're already confirmed to have access to. Returns null
 * if the workspace has no active businesses yet (caller should route to
 * onboarding / a "create your first business" state — never fabricate one).
 */
export async function resolveActiveBusiness(workspaceUser: WorkspaceUser): Promise<BusinessProfile | null> {
  const cookieBusinessId = await getActiveBusinessCookie(workspaceUser.workspaceId);
  if (cookieBusinessId) {
    const business = await businessRepo.findByIdInWorkspace(cookieBusinessId, workspaceUser.workspaceId);
    if (business && business.isActive) return business;
    // Stale/invalid/cross-workspace cookie value — fall through to the default below rather than trusting it.
  }

  const businesses = await businessRepo.listByWorkspace(workspaceUser.workspaceId, false);
  return businesses[0] ?? null;
}

/**
 * Explicit-businessId entry point for API routes and Server Components
 * that receive a businessId from a route param or request body. This is
 * the IDOR guard: it always re-verifies the business belongs to the
 * caller's already-authorized workspace before returning it, regardless
 * of what the client claims.
 */
export async function requireBusinessAccess(
  workspaceUser: WorkspaceUser,
  businessId: string
): Promise<BusinessProfile> {
  const business = await businessRepo.findByIdInWorkspace(businessId, workspaceUser.workspaceId);
  if (!business) {
    throw new ApiException("NOT_FOUND", "Business not found, or it doesn't belong to this workspace.");
  }
  return business;
}
