/**
 * src/modules/audience/repository.ts
 */
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export async function findByIdInBusiness(id: string, businessId: string) {
  return db.audienceSegment.findFirst({ where: { id, businessId } });
}

export async function listByBusiness(businessId: string, includeArchived = false) {
  return db.audienceSegment.findMany({
    where: { businessId, ...(includeArchived ? {} : { isActive: true }) },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });
}

export async function create(businessId: string, createdById: string, data: Prisma.AudienceSegmentCreateWithoutBusinessInput) {
  return db.audienceSegment.create({
    data: { ...data, business: { connect: { id: businessId } }, createdBy: { connect: { id: createdById } } },
  });
}

export async function update(id: string, data: Prisma.AudienceSegmentUpdateInput) {
  return db.audienceSegment.update({ where: { id }, data });
}

export async function archive(id: string) {
  return db.audienceSegment.update({ where: { id }, data: { isActive: false, archivedAt: new Date(), isPrimary: false } });
}

export async function restore(id: string) {
  return db.audienceSegment.update({ where: { id }, data: { isActive: true, archivedAt: null } });
}

/** Transactionally unset any existing primary for the business, then set the new one — the only way `isPrimary` consistency (at most one per business) is enforced, since it isn't a DB constraint. */
export async function setPrimary(businessId: string, segmentId: string) {
  return db.$transaction(async (tx) => {
    await tx.audienceSegment.updateMany({
      where: { businessId, isPrimary: true },
      data: { isPrimary: false },
    });
    return tx.audienceSegment.update({ where: { id: segmentId }, data: { isPrimary: true } });
  });
}
