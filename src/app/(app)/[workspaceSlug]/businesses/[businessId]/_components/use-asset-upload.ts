/**
 * src/app/(app)/[workspaceSlug]/businesses/[businessId]/_components/use-asset-upload.ts
 *
 * The real, complete upload flow: hash the file client-side (Web Crypto
 * SubtleCrypto — no library needed), ask the server whether this exact
 * content already exists (dedup) or needs a presigned URL, PUT directly
 * to S3 if needed, then confirm so the server can verify the real
 * content type and create the FileAsset/FileAssetVersion rows.
 */
"use client";

import { useState } from "react";
import type { FileAssetCategory } from "@prisma/client";
import type { FileAssetDTO } from "@/modules/assets/types";

async function sha256Hex(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function useAssetUpload(workspaceSlug: string) {
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(
    file: File,
    opts: { category: FileAssetCategory; name: string; businessId?: string; fileAssetId?: string }
  ): Promise<FileAssetDTO | null> {
    setError(null);
    setProgress(0);
    try {
      const sha256Hash = await sha256Hex(file);
      setProgress(20);

      const initiateRes = await fetch(`/api/v1/workspaces/${workspaceSlug}/assets/initiate-upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId: opts.businessId,
          category: opts.category,
          name: opts.name,
          originalFilename: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          sha256Hash,
        }),
      });
      const initiateJson = await initiateRes.json();
      if (!initiateRes.ok) {
        setError(initiateJson.error?.message ?? "Couldn't start the upload.");
        return null;
      }
      setProgress(40);

      const { dedup, storageKey, uploadUrl } = initiateJson.data as {
        dedup: boolean;
        storageKey: string;
        uploadUrl?: string;
      };

      if (!dedup && uploadUrl) {
        const putRes = await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
        if (!putRes.ok) {
          setError("Upload to storage failed. Please try again.");
          return null;
        }
      }
      setProgress(80);

      const confirmRes = await fetch(`/api/v1/workspaces/${workspaceSlug}/assets/confirm-upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileAssetId: opts.fileAssetId,
          storageKey,
          sha256Hash,
          businessId: opts.businessId,
          category: opts.category,
          name: opts.name,
          originalFilename: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
        }),
      });
      const confirmJson = await confirmRes.json();
      if (!confirmRes.ok) {
        setError(confirmJson.error?.message ?? "Couldn't finalize the upload.");
        return null;
      }
      setProgress(100);
      return confirmJson.data as FileAssetDTO;
    } catch {
      setError("Upload failed. Please check your connection and try again.");
      return null;
    } finally {
      setTimeout(() => setProgress(null), 600);
    }
  }

  return { upload, progress, error };
}
