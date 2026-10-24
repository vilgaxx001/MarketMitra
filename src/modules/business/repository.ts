/**
 * src/modules/business/repository.ts
 */
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export async function findById(id: string) {
  return db.businessProfile.findUnique({ where: { id } });
}

/** IDOR guard helper — verifies the business belongs to the given workspace in the same query, rather than fetching-then-checking in application code. */
export async function findByIdInWorkspace(id: string, workspaceId: string) {
  return db.businessProfile.findFirst({ where: { id, workspaceId } });
}

export async function findBySlug(workspaceId: string, slug: string) {
  return db.businessProfile.findUnique({ where: { workspaceId_slug: { workspaceId, slug } } });
}

export async function slugExists(workspaceId: string, slug: string): Promise<boolean> {
  const existing = await db.businessProfile.findUnique({
    where: { workspaceId_slug: { workspaceId, slug } },
    select: { id: true },
  });
  return existing !== null;
}

export async function listByWorkspace(workspaceId: string, includeArchived = false) {
  return db.businessProfile.findMany({
    where: { workspaceId, ...(includeArchived ? {} : { isActive: true }) },
    orderBy: { createdAt: "asc" },
  });
}

export async function countActive(workspaceId: string): Promise<number> {
  return db.businessProfile.count({ where: { workspaceId, isActive: true } });
}

export async function create(data: {
  workspaceId: string;
  slug: string;
  businessName: string;
  createdById: string;
} & Partial<Prisma.BusinessProfileCreateInput>) {
  const { workspaceId, slug, businessName, createdById, ...rest } = data;
  return db.businessProfile.create({
    data: {
      workspace: { connect: { id: workspaceId } },
      slug,
      businessName,
      createdBy: { connect: { id: createdById } },
      ...rest,
    },
  });
}

export async function update(id: string, data: Prisma.BusinessProfileUpdateInput) {
  return db.businessProfile.update({ where: { id }, data });
}

export async function archive(id: string) {
  return db.businessProfile.update({ where: { id }, data: { isActive: false, archivedAt: new Date() } });
}

export async function restore(id: string) {
  return db.businessProfile.update({ where: { id }, data: { isActive: true, archivedAt: null } });
}

/** Full context load for the Business Context Engine — one round trip for everything it needs. */
export async function findFullContext(id: string) {
  return db.businessProfile.findUnique({
    where: { id },
    include: {
      workspace: { select: { id: true, name: true, slug: true } },
      brandIdentity: { include: { logoAsset: { include: { currentVersion: true } } } },
      audienceSegments: { where: { isActive: true } },
      fileAssets: {
        where: { isArchived: false },
        include: { currentVersion: true },
      },
    },
  });
}
