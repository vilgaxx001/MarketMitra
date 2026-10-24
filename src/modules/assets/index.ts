/**
 * src/modules/assets/index.ts — public API of the assets module.
 */
export type { FileAssetDTO, FileAssetVersionDTO } from "./types";
export { initiateUploadSchema, confirmUploadSchema, ALLOWED_MIME_TYPES_BY_CATEGORY, MAX_SIZE_BYTES_BY_CATEGORY } from "./validators";
export type { InitiateUploadInput, ConfirmUploadInput } from "./validators";
export { initiateUpload, confirmUpload, listAssets, archiveAsset } from "./service";
