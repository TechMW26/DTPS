export type MediaKind =
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "office"
  | "text"
  | "document"
  | "unknown";

export type MediaReference =
  | string
  | null
  | undefined
  | object;

const MEDIA_URL_FIELDS = [
  "url",
  "filePath",
  "imagePath",
  "localPath",
  "imageUrl",
  "blobUrl",
  "imageKitUrl",
  "fileUrl",
  "mediaUrl",
  "dbUrl",
  "src",
  "path",
] as const;

const OFFICE_EXTENSIONS = new Set(["doc", "docx", "xls", "xlsx", "ppt", "pptx"]);
const TEXT_EXTENSIONS = new Set(["txt", "csv", "json", "xml", "md"]);
const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "avif", "svg", "heic", "heif"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "webm", "mkv", "avi", "m4v"]);
const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "m4a", "aac", "ogg", "opus", "flac", "webm"]);
const ARCHIVE_EXTENSIONS = new Set(["zip", "rar", "7z", "tar", "gz"]);

export function isPublicMediaUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (url.hostname === "ik.imagekit.io" ||
        url.hostname.endsWith(".public.blob.vercel-storage.com"))
    );
  } catch {
    return false;
  }
}

export function getMediaUrl(reference: MediaReference): string {
  if (typeof reference === "string") return reference.trim();
  if (!reference || typeof reference !== "object") return "";
  const values = reference as Record<string, unknown>;

  // Prefer direct CDN URLs (Vercel Blob, etc.) over DB-backed file routes.
  // This avoids unnecessary 307 redirect hops that break WaveSurfer.js
  // and other media players that don't follow redirects correctly.
  for (const field of MEDIA_URL_FIELDS) {
    const value = values[field];
    if (typeof value === "string" && value.trim() && /^https?:\/\//i.test(value)) {
      return value.trim();
    }
  }

  // Fallback: if no direct CDN URL, route through DB-backed /api/files/{id}
  const fileId = values.fileId;
  if (typeof fileId === "string" && /^[a-f\d]{24}$/i.test(fileId)) {
    return `/api/files/${fileId}`;
  }

  // Last resort: any non-HTTPS URL field
  for (const field of MEDIA_URL_FIELDS) {
    const value = values[field];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

/** Normalizes current and historic DTPS media paths without changing CDN URLs. */
export function normalizeMediaUrl(reference: MediaReference, baseOrigin = ""): string {
  let raw = getMediaUrl(reference).replace(/^['"]|['"]$/g, "").replace(/\\/g, "/");
  if (!raw || /^(javascript|file):/i.test(raw)) return "";
  if (/^data:/i.test(raw)) return "";
  if (/^blob:/i.test(raw)) return raw;

  raw = raw.replace(/^\.\//, "/");
  raw = raw.replace(/^\/?public\/(uploads\/)/i, "/$1");
  raw = raw.replace(/^uploads\//i, "/uploads/");
  raw = raw.replace(/^api\/(files|reports|receipts)\//i, "/api/$1/");

  // Some old records contain an absolute server filesystem path.
  const embeddedUpload = raw.match(/\/public\/(uploads\/.*)$/i);
  if (embeddedUpload) raw = `/${embeddedUpload[1]}`;

  if (/^\/\//.test(raw)) {
    const protocol = baseOrigin ? new URL(baseOrigin).protocol : "https:";
    raw = `${protocol}${raw}`;
  }

  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      // Rebase application-owned paths. This repairs localhost, private-IP and
      // retired-domain URLs stored by older desktop/mobile deployments.
      const isCanonicalDtpsHost = /^(?:www\.)?dtps\.tech$/i.test(parsed.hostname);
      if (
        baseOrigin &&
        !isCanonicalDtpsHost &&
        (/^\/uploads\//i.test(parsed.pathname) || /^\/api\/(files|reports|receipts)\//i.test(parsed.pathname))
      ) {
        return `${baseOrigin.replace(/\/$/, "")}${parsed.pathname}${parsed.search}${parsed.hash}`;
      }
      return parsed.toString();
    } catch {
      return "";
    }
  }

  if (!raw.startsWith("/")) raw = `/${raw}`;
  return baseOrigin ? `${baseOrigin.replace(/\/$/, "")}${raw}` : raw;
}

export function getMediaProxyUrl(
  reference: MediaReference,
  options?: { download?: boolean; filename?: string },
): string {
  const url = normalizeMediaUrl(reference);
  if (!url || /^blob:/i.test(url)) return url;
  if (/\/api\/media\/resolve(?:\?|$)/i.test(url)) return url;

  const params = new URLSearchParams({ url });
  if (options?.download) params.set("download", "1");
  if (options?.filename) params.set("filename", options.filename);
  return `/api/media/resolve?${params.toString()}`;
}

/**
 * Ordered image sources for resilient rendering. Public CDN media is loaded
 * directly first (one network hop); application and legacy paths use the
 * recovery proxy first. Every list also contains a cache-busted recovery
 * attempt so a transient browser/CDN/proxy failure does not immediately turn
 * into a broken-image placeholder.
 */
export function getReliableImageSources(
  reference: MediaReference,
  retryToken = 0,
): string[] {
  const normalized = normalizeMediaUrl(reference);
  if (!normalized) return [];

  const proxy = getMediaProxyUrl(normalized);
  const directFirst = isPublicMediaUrl(normalized);
  const candidates = directFirst
    ? [normalized, proxy]
    : [proxy, normalized];

  if (!/^blob:/i.test(normalized)) {
    const separator = normalized.includes("?") ? "&" : "?";
    const recoveryUrl = `${normalized}${separator}dtpsMediaRetry=${retryToken || Math.floor(Date.now() / 600000)}`;
    candidates.push(getMediaProxyUrl(recoveryUrl));
  }

  return candidates.filter(
    (candidate, index, values): candidate is string =>
      Boolean(candidate) && values.indexOf(candidate) === index,
  );
}

export function getMediaMetadataUrl(reference: MediaReference): string {
  const url = normalizeMediaUrl(reference);
  if (!url || /^blob:/i.test(url)) return "";
  return `/api/media/resolve?${new URLSearchParams({ url, metadata: "1" }).toString()}`;
}

export async function resolveDocumentViewerSource(
  reference: MediaReference,
  filename = "Document",
  mimeType = "",
  signal?: AbortSignal,
): Promise<string> {
  const url = normalizeMediaUrl(reference);
  const proxyUrl = getMediaProxyUrl(url);
  if (!url || !proxyUrl) throw new Error("Document URL is unavailable");

  const response = await fetch(proxyUrl, {
    method: "HEAD",
    credentials: "include",
    cache: "no-store",
    signal,
  });
  const responseType = response.headers.get("content-type") || "";
  if (!response.ok || /application\/json|text\/html/i.test(responseType)) {
    throw new Error("Document could not be loaded");
  }

  const kind = getMediaKind(filename, mimeType || responseType, url);
  const isApp =
    typeof window !== "undefined" &&
    /DTPSApp\/|; wv\)/i.test(window.navigator.userAgent);
  const needsHostedViewer = kind === "office" || (isApp && kind === "pdf");
  if (!needsHostedViewer) return proxyUrl;

  let publicUrl = isPublicMediaUrl(url) ? url : "";
  if (!publicUrl) {
    try {
      const metadataUrl = getMediaMetadataUrl(url);
      const metadataResponse = await fetch(metadataUrl, {
        credentials: "include",
        cache: "no-store",
        signal,
      });
      if (metadataResponse.ok) {
        const metadata = (await metadataResponse.json()) as {
          publicUrl?: string | null;
        };
        if (isPublicMediaUrl(metadata.publicUrl || "")) {
          publicUrl = metadata.publicUrl || "";
        }
      }
    } catch (error) {
      if (signal?.aborted) throw error;
    }
  }

  return publicUrl
    ? `https://docs.google.com/viewer?url=${encodeURIComponent(publicUrl)}&embedded=true`
    : proxyUrl;
}

function extensionOf(filename = "", url = ""): string {
  const value = filename || url;
  const pathname = value.split(/[?#]/, 1)[0];
  return pathname.includes(".") ? pathname.split(".").pop()!.toLowerCase() : "";
}

export function getMediaKind(filename = "", mimeType = "", url = ""): MediaKind {
  const mime = mimeType.toLowerCase().split(";", 1)[0].trim();
  const ext = extensionOf(filename, url);

  if (mime.startsWith("image/") || IMAGE_EXTENSIONS.has(ext)) return "image";
  if (mime.startsWith("video/") || VIDEO_EXTENSIONS.has(ext)) return "video";
  if (mime.startsWith("audio/") || AUDIO_EXTENSIONS.has(ext)) return "audio";
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (
    OFFICE_EXTENSIONS.has(ext) ||
    /officedocument|msword|ms-excel|spreadsheet|presentation/.test(mime)
  ) return "office";
  if (mime.startsWith("text/") || TEXT_EXTENSIONS.has(ext)) return "text";
  if (mime || ext) return "document";
  return "unknown";
}

export function isViewableDocument(filename = "", mimeType = "", url = ""): boolean {
  const extension = extensionOf(filename, url);
  if (ARCHIVE_EXTENSIONS.has(extension) || /(?:zip|rar|compressed|tar)/i.test(mimeType)) {
    return false;
  }
  return ["pdf", "office", "text", "document"].includes(
    getMediaKind(filename, mimeType, url),
  );
}

export function getDocumentViewerUrl(
  reference: MediaReference,
  filename = "Document",
  mimeType = "",
): string {
  const url = normalizeMediaUrl(reference);
  if (!url) return "";
  return `/viewer/document?${new URLSearchParams({ url, filename, mimeType }).toString()}`;
}

export function openMediaInApp(reference: MediaReference, filename = "Document", mimeType = ""): void {
  const target = getDocumentViewerUrl(reference, filename, mimeType);
  if (target && typeof window !== "undefined") {
    if (/DTPSApp\/|; wv\)/i.test(window.navigator.userAgent)) {
      window.location.assign(target);
    } else {
      window.open(target, "_blank", "noopener,noreferrer");
    }
  }
}
