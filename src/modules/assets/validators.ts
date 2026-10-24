/**
 * src/modules/assets/validators.ts
 */
import { z } from "zod";

const IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"] as const;
const DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "text/csv",
] as const;

/** Server-side allowlist per category — the client's declared category picks which set applies. Never trust the client's MIME claim alone; the confirm-upload step re-derives it from the uploaded bytes (magic-byte sniff) before persisting. */
export const ALLOWED_MIME_TYPES_BY_CATEGORY: Record<string, readonly string[]> = {
  LOGO: IMAGE_MIME_TYPES,
  IMAGE: IMAGE_MIME_TYPES,
  BRAND_ASSET: [...IMAGE_MIME_TYPES, ...DOCUMENT_MIME_TYPES],
  DOCUMENT: DOCUMENT_MIME_TYPES,
  OTHER: [...IMAGE_MIME_TYPES, ...DOCUMENT_MIME_TYPES],
};

export const MAX_SIZE_BYTES_BY_CATEGORY: Record<string, number> = {
  LOGO: 5 * 1024 * 1024, // 5MB
  IMAGE: 10 * 1024 * 1024,
  BRAND_ASSET: 20 * 1024 * 1024,
  DOCUMENT: 20 * 1024 * 1024,
  OTHER: 10 * 1024 * 1024,
};

export const initiateUploadSchema = z.object({
  businessId: z.string().cuid().optional(),
  category: z.enum(["LOGO", "BRAND_ASSET", "DOCUMENT", "IMAGE", "OTHER"]),
  name: z.string().trim().min(1).max(150),
  originalFilename: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(120),
  sizeBytes: z.number().int().positive().max(50 * 1024 * 1024, "File is too large (50MB max)"),
});
export type InitiateUploadInput = z.infer<typeof initiateUploadSchema>;

export const confirmUploadSchema = z.object({
  fileAssetId: z.string().cuid().optional(), // omit to create a new FileAsset; provide to add a new version to an existing one
  storageKey: z.string().min(1),
  sha256Hash: z.string().length(64, "Invalid SHA-256 hash"),
  businessId: z.string().cuid().optional(),
  category: z.enum(["LOGO", "BRAND_ASSET", "DOCUMENT", "IMAGE", "OTHER"]),
  name: z.string().trim().min(1).max(150),
  originalFilename: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(120),
  sizeBytes: z.number().int().positive(),
});
export type ConfirmUploadInput = z.infer<typeof confirmUploadSchema>;
