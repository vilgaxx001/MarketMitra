/**
 * src/modules/assets/service.ts
 */
import { ApiException } from "@/lib/api-response";
import { logActivity } from "@/modules/activity/service";
import * as repo from "./repository";
import * as storage from "./storage";
import { verifyMimeTypeMatchesContent } from "./mime-sniff";
import { resolveScanStatus } from "./scan-contract";
import { ALLOWED_MIME_TYPES_BY_CATEGORY, MAX_SIZE_BYTES_BY_CATEGORY } from "./validators";
import type { InitiateUploadInput, ConfirmUploadInput } from "./validators";
import type { FileAssetDTO } from "./types";
import type { FileAssetCategory } from "@prisma/client";

function validateAgainstCategory(category: FileAssetCategory, mimeType: string, sizeBytes: number): void {
  const allowedTypes = ALLOWED_MIME_TYPES_BY_CATEGORY[category] ?? [];
  if (!allowedTypes.includes(mimeType)) {
    throw new ApiException(
      "VALIDATION_ERROR",
      `File type "${mimeType}" isn't allowed for ${category.toLowerCase().replace("_", " ")} uploads.`
    );
  }
  const maxSize = MAX_SIZE_BYTES_BY_CATEGORY[category] ?? 10 * 1024 * 1024;
  if (sizeBytes > maxSize) {
    throw new ApiException(
      "VALIDATION_ERROR",
      `File is too large. Maximum for ${category.toLowerCase().replace("_", " ")} is ${Math.round(maxSize / 1024 / 1024)}MB.`
    );
  }
}

interface AssetForDTO {
  id: string;
  workspaceId: string;
  businessId: string | null;
  category: FileAssetCategory;
  name: string;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
  currentVersion: {
    id: string;
    versionNumber: number;
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
    scanStatus: import("@prisma/client").FileScanStatus;
    uploadedById: string | null;
    createdAt: Date;
    storageKey: string;
  } | null;
}

async function toDTO(asset: AssetForDTO | null, versionCount: number): Promise<FileAssetDTO | null> {
  if (!asset) return null;
  return {
    id: asset.id,
    workspaceId: asset.workspaceId,
    businessId: asset.businessId,
    category: asset.category,
    name: asset.name,
    isArchived: asset.isArchived,
    currentVersion: asset.currentVersion
      ? {
          id: asset.currentVersion.id,
          versionNumber: asset.currentVersion.versionNumber,
          originalFilename: asset.currentVersion.originalFilename,
          mimeType: asset.currentVersion.mimeType,
          sizeBytes: asset.currentVersion.sizeBytes,
          scanStatus: asset.currentVersion.scanStatus,
          uploadedById: asset.currentVersion.uploadedById,
          createdAt: asset.currentVersion.createdAt,
        }
      : null,
    versionCount,
    downloadUrl: asset.currentVersion ? await storage.resolveDownloadUrl(asset.currentVersion.storageKey) : null,
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
  };
}

/**
 * Step 1 of the upload flow. Validates category/MIME/size, checks for an
 * existing object with identical content (SHA-256 dedup — client computes
 * the hash locally before calling this), and either short-circuits by
 * reusing the existing storageKey or issues a presigned S3 PUT URL.
 */
export async function initiateUpload(
  workspaceId: string,
  input: InitiateUploadInput & { sha256Hash: string }
): Promise<
  | { dedup: true; storageKey: string }
  | { dedup: false; uploadUrl: string; storageKey: string; expiresInSeconds: number }
> {
  validateAgainstCategory(input.category, input.mimeType, input.sizeBytes);

  const existing = await repo.findExistingVersionByHash(workspaceId, input.sha256Hash);
  if (existing) {
    return { dedup: true, storageKey: existing.storageKey };
  }

  const storageKey = storage.buildStorageKey(workspaceId, input.businessId ?? null, input.originalFilename);
  const { uploadUrl, expiresInSeconds } = await storage.createPresignedUploadUrl(
    storageKey,
    input.mimeType,
    input.sizeBytes
  );
  return { dedup: false, uploadUrl, storageKey, expiresInSeconds };
}

/**
 * Step 2 — called after the client has PUT the file to S3 (or immediately,
 * for a dedup hit). Re-verifies the file's real content type from its
 * magic bytes before persisting, resolves scan status honestly (see
 * scan-contract.ts), and creates the FileAsset/FileAssetVersion rows.
 */
export async function confirmUpload(
  workspaceId: string,
  actorId: string,
  input: ConfirmUploadInput
): Promise<FileAssetDTO> {
  validateAgainstCategory(input.category, input.mimeType, input.sizeBytes);

  const headBytes = await storage.fetchObjectHeadBytes(input.storageKey, 16);
  if (!verifyMimeTypeMatchesContent(headBytes, input.mimeType)) {
    throw new ApiException(
      "VALIDATION_ERROR",
      "The uploaded file's content doesn't match its declared type. Upload rejected."
    );
  }

  const scanResult = await resolveScanStatus({
    storageKey: input.storageKey,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
  });

  let assetId: string;
  let created: Awaited<ReturnType<typeof repo.createAssetWithFirstVersion>>;

  if (input.fileAssetId) {
    const existing = await repo.findAssetInWorkspace(input.fileAssetId, workspaceId);
    if (!existing) throw new ApiException("NOT_FOUND", "Asset not found.");
    created = await repo.addVersion(input.fileAssetId, {
      storageKey: input.storageKey,
      sha256Hash: input.sha256Hash,
      originalFilename: input.originalFilename,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      scanStatus: scanResult.status,
      uploadedById: actorId,
    });
    assetId = input.fileAssetId;

    await logActivity({
      workspaceId,
      actorId,
      action: "asset.version_created",
      targetType: "asset",
      targetId: assetId,
      metadata: { businessId: input.businessId, assetId, versionNumber: created.currentVersion?.versionNumber },
    });
  } else {
    created = await repo.createAssetWithFirstVersion({
      workspaceId,
      businessId: input.businessId ?? null,
      category: input.category,
      name: input.name,
      storageKey: input.storageKey,
      sha256Hash: input.sha256Hash,
      originalFilename: input.originalFilename,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      scanStatus: scanResult.status,
      uploadedById: actorId,
    });
    assetId = created.id;

    await logActivity({
      workspaceId,
      actorId,
      action: "asset.uploaded",
      targetType: "asset",
      targetId: assetId,
      metadata: { businessId: input.businessId, assetId, category: input.category },
    });
  }

  const full = await repo.findAssetInWorkspace(assetId, workspaceId);
  const dto = await toDTO(full, full?.versions.length ?? 0);
  if (!dto) throw new ApiException("INTERNAL_ERROR", "Asset was created but could not be reloaded.");
  return dto;
}

export async function listAssets(
  workspaceId: string,
  filters: { businessId?: string | null; category?: FileAssetCategory }
): Promise<FileAssetDTO[]> {
  const assets = await repo.listAssets(workspaceId, filters);
  const dtos = await Promise.all(assets.map((a) => toDTO(a, a._count.versions)));
  return dtos.filter((d): d is FileAssetDTO => d !== null);
}

export async function archiveAsset(assetId: string, workspaceId: string, actorId: string): Promise<void> {
  const existing = await repo.findAssetInWorkspace(assetId, workspaceId);
  if (!existing) throw new ApiException("NOT_FOUND", "Asset not found.");

  await repo.archiveAsset(assetId);

  await logActivity({
    workspaceId,
    actorId,
    action: "asset.archived",
    targetType: "asset",
    targetId: assetId,
    metadata: { businessId: existing.businessId, assetId },
  });
}
