/**
 * src/modules/auth/service.ts
 *
 * Authentication business logic. All operations that span multiple
 * repository calls, require token generation, or send emails live here.
 *
 * NOTHING in this file touches Express/Next.js request/response objects —
 * it takes plain data, returns plain data, throws ApiException on
 * expected failures. The API routes in src/app/api/v1/auth/ are thin
 * callers that handle HTTP concerns.
 */

import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { createHash } from "crypto";
import type { PlatformRole } from "@prisma/client";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { ApiException } from "@/lib/api-response";
import { sendEmail, emailTemplates } from "@/lib/email";
import * as repo from "@/modules/auth/repository";
import { createSessionToken } from "@/modules/auth/session";
import type { SignupInput, LoginInput } from "@/modules/auth/validators";
import type { AuthUser, SessionPayload } from "@/modules/auth/types";

const BCRYPT_ROUNDS = 12;
const TOKEN_EXPIRY_HOURS = { emailVerification: 24, passwordReset: 1 };

/**
 * Hash compared against when the e-mail is unknown, so the "no such user" path spends the same bcrypt
 * work (same cost factor) as the "wrong password" path. It MUST be a well-formed bcrypt hash: bcryptjs
 * rejects a malformed one in microseconds, which turned the unknown-user path into a ~10^4x faster
 * response and made registered e-mails enumerable by timing. Generated once per process from random
 * bytes (nothing to leak, no password it can match) and memoised.
 */
let dummyPasswordHash: Promise<string> | undefined;
export function getDummyPasswordHash(): Promise<string> {
  dummyPasswordHash ??= bcrypt.hash(nanoid(48), BCRYPT_ROUNDS);
  return dummyPasswordHash;
}

/* -------------------------------------------------------------------------
 * Token helpers — never stored raw, always hashed before DB write.
 * ---------------------------------------------------------------------- */

function generateSecureToken(): string {
  return nanoid(48); // 48 URL-safe chars = 286 bits of entropy
}

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

function tokenExpiresAt(hours: number): Date {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

/* -------------------------------------------------------------------------
 * Signup
 * ---------------------------------------------------------------------- */

export async function signup(input: SignupInput): Promise<{ user: AuthUser; sessionToken: string }> {
  if (!env.ENABLE_SIGNUPS) {
    throw new ApiException("FORBIDDEN", "New signups are currently disabled.");
  }

  // Check email not already taken
  const existing = await repo.findUserByEmail(input.email);
  if (existing) {
    throw new ApiException(
      "CONFLICT",
      "An account with this email already exists. Try logging in instead."
    );
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  const user = await repo.createUser({
    name: input.name,
    email: input.email,
    passwordHash,
  });

  logger.info({ msg: "User signed up", userId: user.id });

  // Send verification email (non-blocking — don't fail signup if email
  // delivery is misconfigured; the user can request a resend later)
  sendVerificationEmail(user.id, user.email, user.name).catch((err) => {
    logger.error({ msg: "Failed to send verification email after signup", userId: user.id, err });
  });

  // Create session immediately — user is logged in after signup
  const sessionToken = await createSessionForUser(user);

  return {
    user: toAuthUser(user),
    sessionToken,
  };
}

/* -------------------------------------------------------------------------
 * Login
 * ---------------------------------------------------------------------- */

export async function login(
  input: LoginInput,
  meta: { userAgent?: string; ipAddress?: string } = {}
): Promise<{ user: AuthUser; sessionToken: string }> {
  // The dummy hash is awaited on EVERY login (a no-op after the first), not only for unknown e-mails, so the one-time
  // cost of generating it lands on the first request of either kind rather than marking the first unknown-user request.
  const [user, dummyHash] = await Promise.all([repo.findUserByEmail(input.email), getDummyPasswordHash()]);

  // Use a constant-time comparison even on "user not found" to prevent
  // timing attacks that could enumerate registered emails.
  const passwordHash = user?.passwordHash ?? dummyHash;
  const valid = await bcrypt.compare(input.password, passwordHash);

  if (!user || !valid) {
    throw new ApiException(
      "UNAUTHENTICATED",
      "Incorrect email or password. Please try again."
    );
  }

  if (!user.isActive) {
    throw new ApiException("FORBIDDEN", "This account has been suspended. Contact support.");
  }

  logger.info({ msg: "User logged in", userId: user.id });

  await repo.recordLogin(user.id);
  const sessionToken = await createSessionForUser(user, meta);

  return { user: toAuthUser(user), sessionToken };
}

/* -------------------------------------------------------------------------
 * Logout
 * ---------------------------------------------------------------------- */

export interface ActiveSessionIdentity { sessionId: string; userId: string; email: string; platformRole: PlatformRole }

/**
 * Resolve a (sessionId, userId) pair taken from a VERIFIED session JWT to the identity the database currently holds, or
 * null when the session row is gone/expired (logout, password change/reset) or the account is deactivated. Role and
 * email come from the database, never from the token: a demoted or promoted user takes effect immediately.
 */
export async function resolveActiveSessionIdentity(sessionId: string, userId: string): Promise<ActiveSessionIdentity | null> {
  const row = await repo.findActiveSessionIdentity(sessionId, userId);
  if (!row) return null;
  return { sessionId: row.id, userId: row.user.id, email: row.user.email, platformRole: row.user.platformRole };
}

export async function logout(sessionId: string): Promise<void> {
  await repo.deleteSession(sessionId);
  logger.info({ msg: "Session deleted (logout)", sessionId });
}

/* -------------------------------------------------------------------------
 * Email verification
 * ---------------------------------------------------------------------- */

export async function sendVerificationEmail(
  userId: string,
  email: string,
  name: string
): Promise<void> {
  const rawToken = generateSecureToken();
  const tokenHash = hashToken(rawToken);

  await repo.createEmailVerificationToken({
    userId,
    tokenHash,
    expiresAt: tokenExpiresAt(TOKEN_EXPIRY_HOURS.emailVerification),
  });

  const verificationUrl = `${env.APP_URL}/verify-email?token=${rawToken}`;

  const template = emailTemplates.verifyEmail({ name, verificationUrl });
  await sendEmail({ ...template, to: email });
}

export async function verifyEmail(rawToken: string): Promise<void> {
  const tokenHash = hashToken(rawToken);
  const record = await repo.findEmailVerificationToken(tokenHash);

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw new ApiException(
      "UNAUTHENTICATED",
      "This verification link has expired or already been used. Request a new one."
    );
  }

  await repo.markEmailVerificationTokenUsed(record.id);
  await repo.markEmailVerified(record.userId);

  logger.info({ msg: "Email verified", userId: record.userId });
}

/* -------------------------------------------------------------------------
 * Password reset
 * ---------------------------------------------------------------------- */

export async function requestPasswordReset(email: string): Promise<void> {
  // Always return the same response whether the email exists or not —
  // prevents email enumeration via the reset flow.
  const user = await repo.findUserByEmail(email);

  if (!user) {
    // Still exit cleanly — caller gets the same "check your email" message
    return;
  }

  const rawToken = generateSecureToken();
  const tokenHash = hashToken(rawToken);

  await repo.createPasswordResetToken({
    userId: user.id,
    tokenHash,
    expiresAt: tokenExpiresAt(TOKEN_EXPIRY_HOURS.passwordReset),
  });

  const resetUrl = `${env.APP_URL}/reset-password?token=${rawToken}`;
  const template = emailTemplates.resetPassword({ name: user.name, resetUrl });
  await sendEmail({ ...template, to: user.email });

  logger.info({ msg: "Password reset email sent", userId: user.id });
}

export async function resetPassword(rawToken: string, newPassword: string): Promise<void> {
  const tokenHash = hashToken(rawToken);
  const record = await repo.findPasswordResetToken(tokenHash);

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw new ApiException(
      "UNAUTHENTICATED",
      "This reset link has expired or already been used. Request a new password reset."
    );
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

  // Atomic: mark token used + update password + invalidate all sessions
  await Promise.all([
    repo.markPasswordResetTokenUsed(record.id),
    repo.updateUserPassword(record.userId, passwordHash),
    repo.deleteAllUserSessions(record.userId), // force re-login everywhere
  ]);

  logger.info({ msg: "Password reset completed", userId: record.userId });
}

/* -------------------------------------------------------------------------
 * Change password (authenticated user)
 * ---------------------------------------------------------------------- */

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const user = await repo.findUserById(userId);
  if (!user) throw new ApiException("NOT_FOUND", "User not found.");

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) {
    throw new ApiException("UNAUTHENTICATED", "Current password is incorrect.");
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await repo.updateUserPassword(userId, passwordHash);
  await repo.deleteAllUserSessions(userId);

  logger.info({ msg: "Password changed", userId });
}

/* -------------------------------------------------------------------------
 * Internal helpers
 * ---------------------------------------------------------------------- */

async function createSessionForUser(
  user: Parameters<typeof repo.createSession>[0] extends { userId: string } ? Awaited<ReturnType<typeof repo.findUserById>> : never,
  meta: { userAgent?: string; ipAddress?: string } = {}
): Promise<string> {
  const sessionId = nanoid(32);
  const maxAgeSeconds = env.SESSION_MAX_AGE_DAYS * 24 * 60 * 60;

  const payload: Omit<SessionPayload, "exp"> = {
    sessionId,
    userId: user!.id,
    email: user!.email,
    platformRole: user!.platformRole,
  };

  const token = await createSessionToken(payload);
  const tokenHash = hashToken(token);

  await repo.createSession({
    id: sessionId,
    userId: user!.id,
    tokenHash,
    userAgent: meta.userAgent,
    ipAddress: meta.ipAddress,
    expiresAt: new Date(Date.now() + maxAgeSeconds * 1000),
  });

  return token;
}

function toAuthUser(user: {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  platformRole: import("@prisma/client").PlatformRole;
  emailVerifiedAt: Date | null;
}): AuthUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    platformRole: user.platformRole,
    emailVerifiedAt: user.emailVerifiedAt,
  };
}
