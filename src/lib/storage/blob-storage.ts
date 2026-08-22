import "server-only";

import { put, del, list } from "@vercel/blob";
import { compressImageServer, serverCompressionPresets } from "@/lib/imageCompressionServer";

/** Compression options matching the Sharp-based server compression */
interface BlobCompressionOptions {
  quality?: number;
  maxWidth?: number;
  maxHeight?: number;
  format?: "jpeg" | "webp" | "png";
}

export type BlobUploadType =
  | "avatar"
  | "document"
  | "recipe-image"
  | "message"
  | "note-attachment"
  | "progress"
  | "progress-photo"
  | "medical-report"
  | "ecommerce"
  | "transformation"
  | "receipt"
  | "bug";

const FOLDER_MAP: Record<BlobUploadType, string> = {
  "avatar": "profile",
  "document": "documents",
  "recipe-image": "recipes",
  "message": "messages",
  "note-attachment": "notes",
  "progress": "progress",
  "progress-photo": "transformation",
  "medical-report": "medical-reports",
  "ecommerce": "ecommerce",
  "transformation": "transformations",
  "receipt": "receipts",
  "bug": "bug",
};

export interface BlobUploadResult {
  url: string;
  pathname: string;
  filename: string;
  size: number;
  contentType: string;
}

/**
 * Upload a file to Vercel Blob with optional server-side compression.
 */
export async function uploadToBlob(
  buffer: Buffer,
  options: {
    type: BlobUploadType;
    filename: string;
    contentType?: string;
    compress?: boolean;
    compressionSettings?: BlobCompressionOptions;
    access?: "public";
  }
): Promise<BlobUploadResult | null> {
  try {
    const folder = FOLDER_MAP[options.type] || "misc";
    let uploadBuffer = buffer;
    let finalContentType = options.contentType || "application/octet-stream";
    let finalFilename = options.filename;

    // Compress images server-side before upload
    const isImage = options.contentType?.startsWith("image/") && !options.contentType?.includes("gif");
    if (isImage && options.compress !== false) {
      const settings = options.compressionSettings || {
        quality: 85,
        maxWidth: 1600,
        maxHeight: 1600,
        format: "webp",
      };
      uploadBuffer = await compressImageServer(buffer, settings);
      finalContentType = "image/webp";
      finalFilename = options.filename.replace(/\.[^/.]+$/, ".webp");
    }

    const { url, pathname } = await put(`${folder}/${finalFilename}`, uploadBuffer, {
      access: options.access || "public",
      contentType: finalContentType,
      allowOverwrite: true,
    });

    console.log(`[VercelBlob] Uploaded: ${pathname} (${uploadBuffer.length} bytes)`);

    return {
      url,
      pathname,
      filename: finalFilename,
      size: uploadBuffer.length,
      contentType: finalContentType,
    };
  } catch (error) {
    console.error(`[VercelBlob] Upload failed for ${options.type}/${options.filename}:`, error);
    return null;
  }
}

/**
 * Delete a file from Vercel Blob by URL or pathname.
 */
export async function deleteFromBlob(urlOrPathname: string): Promise<void> {
  try {
    await del(urlOrPathname);
    console.log(`[VercelBlob] Deleted: ${urlOrPathname}`);
  } catch (error) {
    // 404 means already deleted — treat as success
    if (error instanceof Error && error.message.includes("404")) {
      console.log(`[VercelBlob] Already deleted (404): ${urlOrPathname}`);
      return;
    }
    console.error(`[VercelBlob] Delete failed for ${urlOrPathname}:`, error);
  }
}

/**
 * Delete multiple files from Vercel Blob.
 */
export async function deleteMultipleFromBlob(urls: string[]): Promise<void> {
  if (urls.length === 0) return;
  try {
    await del(urls);
    console.log(`[VercelBlob] Batch deleted ${urls.length} files`);
  } catch (error) {
    console.error(`[VercelBlob] Batch delete failed:`, error);
  }
}

/**
 * List blobs with a given prefix.
 */
export async function listBlobs(prefix: string) {
  return list({ prefix });
}
