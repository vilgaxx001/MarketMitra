/**
 * src/modules/activity/repository.ts
 */
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import type { ActivityQueryFilters } from "./types";

export async function createAuditLog(data: {
  workspaceId: string | null;
  actorId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  /** JSON-safe metadata (see `toInputJsonObject` in service.ts). `null` stores SQL NULL: a plain `null` is rejected by Prisma for Json columns. */
  metadata: Prisma.InputJsonObject | null;
  ipAddress?: string | null;
}) {
  const { metadata, ...rest } = data;
  return db.auditLog.create({ data: { ...rest, metadata: metadata ?? Prisma.DbNull } });
}

export async function queryAuditLogs(filters: ActivityQueryFilters) {
  const page = filters.page ?? 1;
  const pageSize = Math.min(filters.pageSize ?? 25, 100);

  const where: Prisma.AuditLogWhereInput = {
    ...(filters.workspaceId && { workspaceId: filters.workspaceId }),
    ...(filters.actorId && { actorId: filters.actorId }),
    ...(filters.action && { action: filters.action }),
    ...(filters.targetType && { targetType: filters.targetType }),
    ...(filters.targetId && { targetId: filters.targetId }),
    ...(filters.dateFrom || filters.dateTo
      ? {
          createdAt: {
            ...(filters.dateFrom && { gte: filters.dateFrom }),
            ...(filters.dateTo && { lte: filters.dateTo }),
          },
        }
      : {}),
    // businessId isn't a column on AuditLog — it's matched inside the JSON
    // metadata blob every Module 4 event writes (see service.ts). Postgres
    // JSON path filtering via Prisma's `path`/`equals` on a Json field.
    ...(filters.businessId && {
      metadata: { path: ["businessId"], equals: filters.businessId },
    }),
  };

  const [rows, totalCount] = await Promise.all([
    db.auditLog.findMany({
      where,
      include: { actor: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.auditLog.count({ where }),
  ]);

  return { rows, totalCount, page, pageSize };
}
