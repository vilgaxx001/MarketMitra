/**
 * src/modules/auth/repository.ts
 *
 * All Prisma queries for authentication live here and ONLY here.
 * No other file talks to db.user, db.session, or token tables directly.
 *
 * WHY: centralises the boundary where "I need to query user data" can be
 * audited. Security-sensitive queries (finding a user by email for login,
 * hashing tokens) are all visible in one file rather than scattered.
 */

import { db } from "@/lib/db";
import type { User } from "@prisma/client";

/* -------------------------------------------------------------------------
 * User queries
 * ---------------------------------------------------------------------- */

export async function findUserByEmail(email: string): Promise<User | null> {
  return db.user.findUnique({ where: { email: email.toLowerCase().trim() } });
}

export async function findUserById(id: string): Promise<User | null> {
  return db.user.findUnique({ where: { id } });
}

export async function createUser(data: {
  name: string;
  email: string;
  passwordHash: string;
}): Promise<User> {
  return db.user.create({
    data: {
      name: data.name,
      email: data.email.toLowerCase().trim(),
      passwordHash: data.passwordHash,
    },
  });
}

export async function markEmailVerified(userId: string): Promise<void> {
  await db.user.update({
    where: { id: userId },
    data: { emailVerifiedAt: new Date() },
  });
}

export async function updateUserPassword(userId: string, passwordHash: string): Promise<void> {
  await db.user.update({
    where: { id: userId },
    data: { passwordHash },
  });
}

export async function updateUserProfile(
  userId: string,
  data: { name?: string; avatarUrl?: string | null }
): Promise<User> {
  return db.user.update({ where: { id: userId }, data });
}

export async function recordLogin(userId: string): Promise<void> {
  await db.user.update({
    where: { id: userId },
    data: { lastLoginAt: new Date() },
  });
}

/* -------------------------------------------------------------------------
 * Session queries
 * ---------------------------------------------------------------------- */

export async function createSession(data: {
  id: string;
  userId: string;
  tokenHash: string;
  userAgent?: string;
  ipAddress?: string;
  expiresAt: Date;
}) {
  return db.session.create({ data });
}

export async function findSessionById(id: string) {
  return db.session.findUnique({ where: { id }, include: { user: true } });
}

/**
 * The live identity behind a session JWT: the `sessions` row (present, owned by that user, not expired) JOINED with its
 * user (still active). Role, email and active-state are read HERE, from the database, so a token claim or a client
 * header can never be what authorises a request. Logout / password change / reset delete the row, which revokes the token.
 */
export async function findActiveSessionIdentity(id: string, userId: string) {
  return db.session.findFirst({
    where: { id, userId, expiresAt: { gt: new Date() }, user: { isActive: true } },
    select: { id: true, user: { select: { id: true, email: true, platformRole: true } } },
  });
}

export async function deleteSession(id: string): Promise<void> {
  await db.session.deleteMany({ where: { id } });
}

export async function deleteAllUserSessions(userId: string): Promise<void> {
  await db.session.deleteMany({ where: { userId } });
}

export async function pruneExpiredSessions(): Promise<number> {
  const result = await db.session.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return result.count;
}

/* -------------------------------------------------------------------------
 * Email verification tokens
 * ---------------------------------------------------------------------- */

export async function createEmailVerificationToken(data: {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}) {
  // Invalidate any existing unused tokens for this user first
  await db.emailVerificationToken.deleteMany({
    where: { userId: data.userId, usedAt: null },
  });
  return db.emailVerificationToken.create({ data });
}

export async function findEmailVerificationToken(tokenHash: string) {
  return db.emailVerificationToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
}

export async function markEmailVerificationTokenUsed(id: string): Promise<void> {
  await db.emailVerificationToken.update({
    where: { id },
    data: { usedAt: new Date() },
  });
}

/* -------------------------------------------------------------------------
 * Password reset tokens
 * ---------------------------------------------------------------------- */

export async function createPasswordResetToken(data: {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}) {
  // Invalidate existing unused tokens for this user
  await db.passwordResetToken.deleteMany({
    where: { userId: data.userId, usedAt: null },
  });
  return db.passwordResetToken.create({ data });
}

export async function findPasswordResetToken(tokenHash: string) {
  return db.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
}

export async function markPasswordResetTokenUsed(id: string): Promise<void> {
  await db.passwordResetToken.update({
    where: { id },
    data: { usedAt: new Date() },
  });
}
