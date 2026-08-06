"use client";

import { upload } from "@vercel/blob/client";

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
  _id?: string;
  id?: string;
  file?: { fileId?: string };
  thumbnail?: string;
  thumbnailUrl?: string;
}

const SERVER_UPLOAD_LIMIT = 4 * 1024 * 1024;

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
): Promise<UploadedFileResult> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("type", type);

  const response = await fetch("/api/upload", { method: "POST", body: formData });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "Upload failed") as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return data as UploadedFileResult;
}

async function directUpload(
  file: File,
  type: ClientUploadType,
  onProgress?: (progress: number) => void,
): Promise<UploadedFileResult> {
  const mimeType = resolvedMimeType(file);
  const filename = safeFilename(file.name);
  const uniqueName = `${Date.now()}-${crypto.randomUUID()}-${filename}`;
  const pathname = `${folders[type]}/${uniqueName}`;

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

export async function uploadFileReliably(
  file: File,
  type: ClientUploadType,
  onProgress?: (progress: number) => void,
): Promise<UploadedFileResult> {
  if (!file.size) throw new Error("The selected file is empty.");

  if (file.size > SERVER_UPLOAD_LIMIT) {
    return directUpload(file, type, onProgress);
  }

  try {
    const result = await serverUpload(file, type);
    onProgress?.(100);
    return result;
  } catch (error) {
    const status = (error as Error & { status?: number }).status;
    if (status === 400 || status === 401 || status === 403) throw error;
    return directUpload(file, type, onProgress);
  }
}
