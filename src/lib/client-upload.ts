"use client";

import { upload } from "@vercel/blob/client";
import { readApiError, resilientFetch, type RequestRecoveryState } from "@/lib/api/resilient-fetch";

export type ClientUploadType =
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
  | "bug";

export interface UploadedFileResult {
  url: string;
  pathname?: string;
  filename: string;
  size: number;
  type: string;
  storage?: "vercel-blob";
  fileId?: string;
  imageKitFileId?: string;
  _id?: string;
  id?: string;
  file?: { fileId?: string };
  thumbnail?: string;
  thumbnailUrl?: string;
}

const SERVER_UPLOAD_LIMIT = 4 * 1024 * 1024;
const UPLOAD_RETRY_DELAYS_MS = [400, 1_000, 2_500];

const folders: Record<ClientUploadType, string> = {
  avatar: "profile",
  document: "documents",
  "recipe-image": "recipes",
  message: "messages",
  "note-attachment": "notes",
  progress: "progress",
  "progress-photo": "transformation",
  "medical-report": "medical-reports",
  ecommerce: "ecommerce",
  transformation: "transformations",
  bug: "bug",
};

const mimeByExtension: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  opus: "audio/opus",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  csv: "text/csv",
  zip: "application/zip",
};

function fileExtension(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() || "bin";
}

function resolvedMimeType(file: File): string {
  return file.type.replace(/;.*$/, "").trim().toLowerCase()
    || mimeByExtension[fileExtension(file.name)]
    || "application/octet-stream";
}

function safeFilename(filename: string): string {
  const cleaned = filename
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(-120);
  return cleaned || `upload.${fileExtension(filename)}`;
}

async function serverUpload(
  file: File,
  type: ClientUploadType,
  operationId: string,
  onRecoveryState?: (state: RequestRecoveryState) => void,
): Promise<UploadedFileResult> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("type", type);

  const response = await resilientFetch("/api/upload", { method: "POST", body: formData }, {
    attempts: 3,
    timeoutMs: 60_000,
    idempotencyKey: operationId,
    onRecoveryState,
  });
  const data = await response.json().catch(() => ({})) as { error?: string } & UploadedFileResult;
  if (!response.ok) {
    const error = new Error(data.error || await readApiError(response, "Upload failed")) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return data as UploadedFileResult;
}

async function directUpload(
  file: File,
  type: ClientUploadType,
  pathname: string,
  onProgress?: (progress: number) => void,
): Promise<UploadedFileResult> {
  const mimeType = resolvedMimeType(file);
  const filename = safeFilename(file.name);

  const blob = await upload(pathname, file, {
    access: "public",
    handleUploadUrl: "/api/upload/client",
    contentType: mimeType,
    multipart: file.size > 10 * 1024 * 1024,
    clientPayload: JSON.stringify({
      uploadType: type,
      originalName: file.name,
      mimeType,
      size: file.size,
    }),
    onUploadProgress: ({ percentage }) => onProgress?.(Math.round(percentage)),
  });

  return {
    url: blob.url,
    pathname: blob.pathname,
    filename,
    size: file.size,
    type: mimeType,
    storage: "vercel-blob",
  };
}

function uploadStatus(error: unknown): number | undefined {
  return (error as Error & { status?: number })?.status;
}

function shouldRetryUpload(error: unknown): boolean {
  const status = uploadStatus(error);
  return status === undefined || status === 408 || status === 429 || status >= 500;
}

async function withUploadRetries<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= UPLOAD_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!shouldRetryUpload(error) || attempt === UPLOAD_RETRY_DELAYS_MS.length) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, UPLOAD_RETRY_DELAYS_MS[attempt]));
    }
  }

  throw lastError;
}

export async function uploadFileReliably(
  file: File,
  type: ClientUploadType,
  onProgress?: (progress: number) => void,
  onRecoveryState?: (state: RequestRecoveryState) => void,
): Promise<UploadedFileResult> {
  if (!file.size) throw new Error("The selected file is empty.");

  const operationId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `upload-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const filename = safeFilename(file.name);
  const pathname = `${folders[type]}/${operationId}-${filename}`;

  if (file.size > SERVER_UPLOAD_LIMIT) {
    return withUploadRetries(() => directUpload(file, type, pathname, onProgress));
  }

  try {
    const result = await serverUpload(file, type, operationId, onRecoveryState);
    onProgress?.(100);
    return result;
  } catch (error) {
    const status = uploadStatus(error);
    if (status === 400 || status === 401 || status === 403) throw error;
    return withUploadRetries(() => directUpload(file, type, pathname, onProgress));
  }
}
