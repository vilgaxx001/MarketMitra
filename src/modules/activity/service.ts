/**
 * src/modules/activity/service.ts
 */
import type { Prisma } from "@prisma/client";
import * as repo from "./repository";
import type { ActivityAction, ActivityLogEntry, ActivityQueryFilters, ActivityTargetType } from "./types";

const SECRET_KEY_PATTERN = /password|token|secret|apikey|api_key|credential/i;

/**
 * Strips any metadata key that looks like it might hold a secret before
 * persisting — defense in depth on top of the rule that call sites must
 * never pass passwords/tokens/API keys/secrets to `logActivity` in the
 * first place (see the "Never log" list in the Module 4 brief).
 */
function redact(metadata: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!metadata) return null;
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    clean[key] = SECRET_KEY_PATTERN.test(key) ? "[redacted]" : value;
  }
  return clean;
}

/**
 * Normalises arbitrary metadata into a value Prisma accepts for a Json column. `undefined` entries are dropped,
 * Dates become ISO strings, bigint becomes a string, non-finite numbers and anything non-serialisable become null,
 * and nesting beyond MAX_JSON_DEPTH is replaced by a marker so a cyclic or hostile structure cannot recurse forever.
 */
const MAX_JSON_DEPTH = 8;
export function toInputJsonValue(value: unknown, depth = 0): Prisma.InputJsonValue | null {
  if (value === null) return null;
  switch (typeof value) {
    case "string": case "boolean": return value;
    case "number": return Number.isFinite(value) ? value : null;
    case "bigint": return value.toString();
    case "object": break;
    default: return null; // undefined, function, symbol
  }
  if (depth >= MAX_JSON_DEPTH) return "[max depth]";
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (Array.isArray(value)) return value.map((v) => toInputJsonValue(v, depth + 1));
  const out: { [key: string]: Prisma.InputJsonValue | null } = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v === undefined || typeof v === "function" || typeof v === "symbol") continue;
    out[k] = toInputJsonValue(v, depth + 1);
  }
  return out;
}
export function toInputJsonObject(metadata: Record<string, unknown> | null): Prisma.InputJsonObject | null {
  if (metadata === null) return null;
  const out: { [key: string]: Prisma.InputJsonValue | null } = {};
  for (const [k, v] of Object.entries(metadata)) {
    if (v === undefined || typeof v === "function" || typeof v === "symbol") continue;
    out[k] = toInputJsonValue(v, 1);
  }
  return out;
}

export async function logActivity(params: {
  workspaceId: string;
  actorId: string | null;
  action: ActivityAction;
  targetType?: ActivityTargetType;
  targetId?: string;
  /** Include `businessId` here for any business-scoped event so activity can be filtered per-business later (AuditLog itself has no businessId column — see repository.ts). */
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
}): Promise<void> {
  await repo.createAuditLog({
    workspaceId: params.workspaceId,
    actorId: params.actorId,
    action: params.action,
    targetType: params.targetType ?? null,
    targetId: params.targetId ?? null,
    metadata: toInputJsonObject(redact(params.metadata)),
    ipAddress: params.ipAddress ?? null,
  });
}

export async function queryActivity(filters: ActivityQueryFilters): Promise<{
  entries: ActivityLogEntry[];
  totalCount: number;
  page: number;
  pageSize: number;
}> {
  const { rows, totalCount, page, pageSize } = await repo.queryAuditLogs(filters);
  return {
    entries: rows.map((row) => ({
      id: row.id,
      workspaceId: row.workspaceId,
      actorId: row.actorId,
      actorName: row.actor?.name ?? null,
      action: row.action,
      targetType: row.targetType,
      targetId: row.targetId,
      metadata: (row.metadata as Record<string, unknown> | null) ?? null,
      createdAt: row.createdAt,
    })),
    totalCount,
    page,
    pageSize,
  };
}
