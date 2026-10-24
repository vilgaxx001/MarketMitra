/**
 * src/modules/brand/repository.ts
 */
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export async function findByBusinessId(businessId: string) {
  return db.brandIdentity.findUnique({
    where: { businessId },
    include: { logoAsset: { include: { currentVersion: true } } },
  });
}

/** Plain scalar/array fields of a brand identity (identical meaning in create and update). */
export type BrandWriteFields = Partial<
  Pick<
    Prisma.BrandIdentityUncheckedCreateInput,
    | "brandName" | "primaryColor" | "secondaryColor" | "accentColor" | "typographyPreference"
    | "personality" | "tone" | "toneOfVoice" | "wordsToUse" | "wordsToAvoid" | "brandValues"
    | "mission" | "positioning" | "tagline" | "communicationStyle"
  >
>;

/**
 * `logoAssetId`: undefined = leave unchanged, null = remove the logo, string = connect that asset.
 * Create and update inputs are built separately: Prisma's update-only operations (e.g. `disconnect`) are invalid in a create.
 */
export async function upsert(businessId: string, fields: BrandWriteFields, logoAssetId?: string | null) {
  const logoUpdate: Prisma.BrandIdentityUpdateInput =
    logoAssetId === undefined ? {} : { logoAsset: logoAssetId ? { connect: { id: logoAssetId } } : { disconnect: true } };
  const logoCreate: Pick<Prisma.BrandIdentityCreateInput, "logoAsset"> = logoAssetId ? { logoAsset: { connect: { id: logoAssetId } } } : {};
  return db.brandIdentity.upsert({
    where: { businessId },
    update: { ...fields, ...logoUpdate },
    create: { business: { connect: { id: businessId } }, ...fields, ...logoCreate },
    include: { logoAsset: { include: { currentVersion: true } } },
  });
}
