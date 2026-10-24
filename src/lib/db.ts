/**
 * src/lib/db.ts
 *
 * Prisma client singleton.
 *
 * WHY A SINGLETON: in Next.js dev mode, modules are re-evaluated on every
 * hot reload. Without this pattern, each reload would instantiate a brand
 * new PrismaClient — and therefore a new connection pool — eventually
 * exhausting Postgres's max_connections. We stash the client on `globalThis`
 * in development so reloads reuse the same instance. In production, each
 * server instance creates exactly one client for its lifetime.
 *
 * USAGE:
 *   import { db } from "@/lib/db";
 *   const user = await db.user.findUnique({ where: { id } });
 *
 * No module outside this file should call `new PrismaClient()`.
 */

import { PrismaClient } from "@prisma/client";
import { env, isProduction } from "@/lib/env";
import { logger } from "@/lib/logger";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  return new PrismaClient({
    log: isProduction
      ? [{ level: "error", emit: "event" }, { level: "warn", emit: "event" }]
      : [
          { level: "query", emit: "event" },
          { level: "error", emit: "event" },
          { level: "warn", emit: "event" },
        ],
    datasources: {
      db: { url: env.DATABASE_URL },
    },
  });
}

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (!isProduction) {
  globalForPrisma.prisma = db;
}

// Pipe Prisma's internal events into our structured logger instead of
// letting them go to raw console output.
// @ts-expect-error — Prisma's event typing depends on the `log` config above
db.$on("error", (e: { message: string; target?: string }) => {
  logger.error({ msg: "Prisma error", target: e.target, error: e.message });
});

// @ts-expect-error — same as above
db.$on("warn", (e: { message: string }) => {
  logger.warn({ msg: "Prisma warning", warning: e.message });
});

if (!isProduction) {
  // @ts-expect-error — query event only emitted outside production
  db.$on("query", (e: { query: string; duration: number }) => {
    if (e.duration > 200) {
      logger.warn({ msg: "Slow query", durationMs: e.duration, query: e.query });
    }
  });
}

/**
 * Graceful shutdown — important for long-running Node processes (not
 * needed on most serverless platforms, but included for self-hosted /
 * container deployments).
 */
export async function disconnectDb() {
  await db.$disconnect();
}
