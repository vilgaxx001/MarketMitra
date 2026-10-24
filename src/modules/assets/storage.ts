/**
 * src/modules/assets/storage.ts
 *
 * All direct S3 interaction lives here — nothing else in the codebase
 * should import `@aws-sdk/client-s3` directly. Every upload/download URL
 * handed to the client is a short-lived presigned URL scoped to exactly
 * one object; AWS credentials never leave the server (satisfies the
 * "Do not expose storage credentials" requirement structurally, not just
 * by convention).
 */
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";
import { env, isS3Configured } from "@/lib/env";
import { ApiException } from "@/lib/api-response";

const UPLOAD_URL_TTL_SECONDS = 300; // 5 minutes — plenty for a direct browser upload, short enough to limit exposure
const DOWNLOAD_URL_TTL_SECONDS = 900; // 15 minutes

let cachedClient: S3Client | null = null;

function getClient(): S3Client {
  if (!isS3Configured) {
    throw new ApiException(
      "FEATURE_NOT_AVAILABLE",
      "File storage isn't configured in this environment yet. Set STORAGE_PROVIDER=s3 and the S3_* environment variables to enable uploads."
    );
  }
  if (!cachedClient) {
    cachedClient = new S3Client({
      region: env.S3_REGION!,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID!,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
      },
    });
  }
  return cachedClient;
}

/** Deterministic-ish, collision-resistant key layout — scoped by workspace (and business, when applicable) so a storage-level listing alone reflects tenant boundaries. */
export function buildStorageKey(workspaceId: string, businessId: string | null, originalFilename: string): string {
  const safeName = originalFilename.replace(/[^a-zA-Z0-9.\-_]/g, "_").slice(-100);
  const prefix = businessId
    ? `workspaces/${workspaceId}/businesses/${businessId}`
    : `workspaces/${workspaceId}/files`;
  return `${prefix}/${randomUUID()}-${safeName}`;
}

export async function createPresignedUploadUrl(
  storageKey: string,
  mimeType: string,
  sizeBytes: number
): Promise<{ uploadUrl: string; expiresInSeconds: number }> {
  const command = new PutObjectCommand({
    Bucket: env.S3_BUCKET_NAME!,
    Key: storageKey,
    ContentType: mimeType,
    ContentLength: sizeBytes,
  });
  const uploadUrl = await getSignedUrl(getClient(), command, { expiresIn: UPLOAD_URL_TTL_SECONDS });
  return { uploadUrl, expiresInSeconds: UPLOAD_URL_TTL_SECONDS };
}

/** Public bucket path when S3_PUBLIC_URL is set (typical for brand logos meant to be publicly viewable); otherwise a short-lived presigned GET URL for private objects. */
export async function resolveDownloadUrl(storageKey: string): Promise<string> {
  if (env.S3_PUBLIC_URL) {
    return `${env.S3_PUBLIC_URL.replace(/\/$/, "")}/${storageKey}`;
  }
  const command = new GetObjectCommand({ Bucket: env.S3_BUCKET_NAME!, Key: storageKey });
  return getSignedUrl(getClient(), command, { expiresIn: DOWNLOAD_URL_TTL_SECONDS });
}

/**
 * Reads the first `byteLength` bytes of an already-uploaded object — used
 * by src/modules/assets/mime-sniff.ts to verify the file's real content
 * type server-side rather than trusting the client's declared
 * Content-Type, per the "do not trust client-provided MIME type alone"
 * requirement.
 */
export async function fetchObjectHeadBytes(storageKey: string, byteLength: number): Promise<Uint8Array> {
  const command = new GetObjectCommand({
    Bucket: env.S3_BUCKET_NAME!,
    Key: storageKey,
    Range: `bytes=0-${byteLength - 1}`,
  });
  const response = await getClient().send(command);
  const body = await response.Body?.transformToByteArray();
  return body ?? new Uint8Array();
}
