/**
 * src/modules/assets/types.ts
 */
import type { FileAssetCategory, FileScanStatus } from "@prisma/client";

export interface FileAssetVersionDTO {
  id: string;
  versionNumber: number;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  scanStatus: FileScanStatus;
  uploadedById: string | null;
  createdAt: Date;
}

export interface FileAssetDTO {
  id: string;
  workspaceId: string;
  businessId: string | null;
  category: FileAssetCategory;
  name: string;
  isArchived: boolean;
  currentVersion: FileAssetVersionDTO | null;
  versionCount: number;
  /** Presigned, short-lived — never persisted, resolved fresh on every read. */
  downloadUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}
