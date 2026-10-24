/**
 * src/modules/assets/repository.ts
 */
import { db } from "@/lib/db";
import type { FileAssetCategory, FileScanStatus } from "@prisma/client";

export async function findAssetInWorkspace(id: string, workspaceId: string) {
  return db.fileAsset.findFirst({
    where: { id, workspaceId },
    include: { currentVersion: true, versions: { orderBy: { versionNumber: "desc" } } },
  });
}

export async function listAssets(workspaceId: string, filters: { businessId?: string | null; category?: FileAssetCategory }) {
  return db.fileAsset.findMany({
    where: {
      workspaceId,
      isArchived: false,
      ...(filters.businessId !== undefined && { businessId: filters.businessId }),
      ...(filters.category && { category: filters.category }),
    },
    include: { currentVersion: true, _count: { select: { versions: true } } },
    orderBy: { updatedAt: "desc" },
  });
}

/** Dedup lookup — reuse the existing S3 object if this exact content was already uploaded anywhere in this workspace. */
export async function findExistingVersionByHash(workspaceId: string, sha256Hash: string) {
  return db.fileAssetVersion.findFirst({
    where: { sha256Hash, fileAsset: { workspaceId } },
    orderBy: { createdAt: "desc" },
  });
}

export async function createAssetWithFirstVersion(data: {
  workspaceId: string;
  businessId: string | null;
  category: FileAssetCategory;
  name: string;
  storageKey: string;
  sha256Hash: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  scanStatus: FileScanStatus;
  uploadedById: string;
}) {
  return db.$transaction(async (tx) => {
    const asset = await tx.fileAsset.create({
      data: {
        workspaceId: data.workspaceId,
        businessId: data.businessId,
        category: data.category,
        name: data.name,
      },
    });
    const version = await tx.fileAssetVersion.create({
      data: {
        fileAssetId: asset.id,
        versionNumber: 1,
        storageKey: data.storageKey,
        sha256Hash: data.sha256Hash,
        originalFilename: data.originalFilename,
        mimeType: data.mimeType,
        sizeBytes: data.sizeBytes,
        scanStatus: data.scanStatus,
        uploadedById: data.uploadedById,
      },
    });
    const updated = await tx.fileAsset.update({
      where: { id: asset.id },
      data: { currentVersionId: version.id },
      include: { currentVersion: true },
    });
    return updated;
  });
}

export async function addVersion(
  fileAssetId: string,
  data: {
    storageKey: string;
    sha256Hash: string;
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
    scanStatus: FileScanStatus;
    uploadedById: string;
  }
) {
  return db.$transaction(async (tx) => {
    const lastVersion = await tx.fileAssetVersion.findFirst({
      where: { fileAssetId },
      orderBy: { versionNumber: "desc" },
    });
    const version = await tx.fileAssetVersion.create({
      data: {
        fileAssetId,
        versionNumber: (lastVersion?.versionNumber ?? 0) + 1,
        ...data,
      },
    });
    const updated = await tx.fileAsset.update({
      where: { id: fileAssetId },
      data: { currentVersionId: version.id },
      include: { currentVersion: true },
    });
    return updated;
  });
}

export async function archiveAsset(id: string) {
  return db.fileAsset.update({ where: { id }, data: { isArchived: true, archivedAt: new Date() } });
}
