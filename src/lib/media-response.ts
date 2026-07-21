import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { normalizeMediaUrl } from "@/lib/media";
import connectDB from "@/lib/db/connection";
import { File as FileModel } from "@/lib/db/models/File";
import { getImageKit } from "@/lib/imagekit";

const MIME_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  txt: "text/plain; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  json: "application/json; charset=utf-8",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  svg: "image/svg+xml",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

function contentTypeFor(filename: string): string {
  return MIME_TYPES[path.extname(filename).slice(1).toLowerCase()] || "application/octet-stream";
}

function safeFilename(filename: string): string {
  return (filename || "document").replace(/[^\x20-\x7e]|[\r\n"]/g, "_");
}

function commonHeaders(filename: string, contentType: string, download: boolean): Headers {
  const headers = new Headers({
    "Content-Type": contentType,
    "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${safeFilename(filename)}"`,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Range",
    "Access-Control-Expose-Headers": "Content-Length, Content-Range, Content-Disposition",
  });
  return headers;
}

type StoredMediaRecord = {
  _id: unknown;
  filename?: string;
  originalName?: string;
  mimeType?: string;
  type?: string;
  localPath?: string;
  imageKitFileId?: string;
  imageKitUrl?: string;
};

type RecoveredMedia = { kind: "remote"; url: string; filename: string };

declare global {
  var __dtpsMediaRecoveryCache:
    | Map<string, { value: RecoveredMedia | null; expiresAt: number }>
    | undefined;
}

function mediaRecoveryCache() {
  if (!globalThis.__dtpsMediaRecoveryCache) {
    globalThis.__dtpsMediaRecoveryCache = new Map();
  }
  return globalThis.__dtpsMediaRecoveryCache;
}

function basenameFromMediaUrl(mediaUrl: URL): string {
  const encodedName = mediaUrl.pathname.split("/").pop() || "";
  try {
    return decodeURIComponent(encodedName);
  } catch {
    return encodedName;
  }
}

async function recoverStoredMedia(mediaUrl: URL): Promise<RecoveredMedia | null> {
  const filename = basenameFromMediaUrl(mediaUrl);
  if (!filename) return null;

  const cache = mediaRecoveryCache();
  const cached = cache.get(filename);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  try {
    await connectDB();
    const lookup: Array<Record<string, string>> = [
        { filename },
        { originalName: filename },
        { localPath: mediaUrl.toString() },
        { imageKitUrl: mediaUrl.toString() },
    ];
    if (/^[a-f\d]{24}$/i.test(filename)) {
      lookup.unshift({ _id: filename });
    }

    const record = await FileModel.findOne({ $or: lookup })
      .select("filename originalName mimeType type localPath imageKitFileId imageKitUrl")
      .lean<StoredMediaRecord | null>();

    if (record?.imageKitUrl) {
      const value: RecoveredMedia = {
        kind: "remote",
        url: record.imageKitUrl,
        filename: record.originalName || record.filename || filename,
      };
      cache.set(filename, { value, expiresAt: Date.now() + 60 * 60_000 });
      return value;
    }

    if (record?.imageKitFileId) {
      const imagekit = getImageKit();
      const details = imagekit
        ? await imagekit.getFileDetails(record.imageKitFileId)
        : null;
      if (details?.url) {
        const value: RecoveredMedia = {
          kind: "remote",
          url: details.url,
          filename: record.originalName || record.filename || filename,
        };
        cache.set(filename, { value, expiresAt: Date.now() + 60 * 60_000 });
        return value;
      }
    }

    // Some transition-period uploads reached ImageKit but their File record
    // retained a legacy /uploads URL. Search the media library by exact name.
    const imagekit = getImageKit();
    if (imagekit) {
      const extensionIndex = filename.lastIndexOf(".");
      const webpName = extensionIndex > 0
        ? `${filename.slice(0, extensionIndex)}.webp`
        : `${filename}.webp`;
      const candidateNames = [...new Set([filename, webpName])];
      for (const candidate of candidateNames) {
        const escaped = candidate.replace(/["\\]/g, "\\$&");
        const matches = await imagekit.listFiles({
          name: escaped,
          limit: 10,
        }) as unknown as Array<{ name?: string; url?: string; fileId?: string }>;
        const match = matches.find((file) => file.name === candidate && file.url);
        if (match?.url) {
          if (record) {
            await FileModel.updateOne(
              { _id: record._id },
              { $set: { imageKitUrl: match.url, imageKitFileId: match.fileId } },
            );
          }
          const value: RecoveredMedia = {
            kind: "remote",
            url: match.url,
            filename: record?.originalName || record?.filename || filename,
          };
          cache.set(filename, { value, expiresAt: Date.now() + 60 * 60_000 });
          return value;
        }
      }
    }

    if (record?.localPath && /^https:\/\//i.test(record.localPath)) {
      const value: RecoveredMedia = {
        kind: "remote",
        url: record.localPath,
        filename: record.originalName || record.filename || filename,
      };
      cache.set(filename, { value, expiresAt: Date.now() + 15 * 60_000 });
      return value;
    }
  } catch (error) {
    console.error("[MediaResolver] Legacy recovery failed", error);
  }

  return null;
}

function metadataResponse(recovered: RecoveredMedia | null): NextResponse {
  return NextResponse.json({
    available: Boolean(recovered),
    publicUrl: recovered?.url || null,
  }, {
    status: recovered ? 200 : 404,
    headers: { "Cache-Control": "private, no-store" },
  });
}

async function proxyRemoteMedia(
  request: NextRequest,
  mediaUrl: URL,
  download: boolean,
  requestedFilename?: string,
): Promise<NextResponse> {
  try {
    const upstream = await fetch(mediaUrl, {
      method: request.method === "HEAD" ? "HEAD" : "GET",
      headers: request.headers.get("range") ? { Range: request.headers.get("range")! } : undefined,
      redirect: "follow",
      cache: "no-store",
    });
    if (!upstream.ok) {
      return NextResponse.json({ error: "Media could not be loaded" }, { status: upstream.status });
    }

    const filename = requestedFilename || basenameFromMediaUrl(mediaUrl) || "document";
    const headers = commonHeaders(
      filename,
      upstream.headers.get("content-type") || contentTypeFor(filename),
      download,
    );
    for (const name of ["content-length", "content-range", "last-modified", "etag"]) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new NextResponse(request.method === "HEAD" ? null : upstream.body, {
      status: upstream.status,
      headers,
    });
  } catch (error) {
    console.error("[MediaResolver] Failed to fetch media", error);
    return NextResponse.json({ error: "Media could not be loaded" }, { status: 502 });
  }
}

function allowedRemoteOrigins(): Set<string> {
  // Keep the historical ImageKit origin available even if an environment
  // variable is temporarily missing; old messages still reference it.
  const origins = new Set(["https://ik.imagekit.io"]);
  for (const value of [process.env.IMAGEKIT_URL_ENDPOINT]) {
    if (!value) continue;
    try {
      origins.add(new URL(value).origin);
    } catch {
      // Ignore malformed optional configuration.
    }
  }
  return origins;
}

export async function handleMediaResolve(request: NextRequest): Promise<NextResponse> {
  const rawUrl = request.nextUrl.searchParams.get("url");
  if (!rawUrl) return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });

  const normalized = normalizeMediaUrl(rawUrl, request.nextUrl.origin);
  if (!normalized || /^(blob|data):/i.test(normalized)) {
    return NextResponse.json({ error: "Invalid media URL" }, { status: 400 });
  }

  let mediaUrl: URL;
  try {
    mediaUrl = new URL(normalized, request.nextUrl.origin);
  } catch {
    return NextResponse.json({ error: "Invalid media URL" }, { status: 400 });
  }

  const download = request.nextUrl.searchParams.get("download") === "1";
  const metadata = request.nextUrl.searchParams.get("metadata") === "1";
  const requestedFilename = request.nextUrl.searchParams.get("filename") || undefined;
  if (
    mediaUrl.origin === request.nextUrl.origin &&
    /^\/api\/files\/[a-f\d]{24}\/?$/i.test(mediaUrl.pathname)
  ) {
    const recovered = await recoverStoredMedia(mediaUrl);
    if (metadata) return metadataResponse(recovered);
    if (recovered) {
      const recoveredUrl = new URL(recovered.url);
      if (!allowedRemoteOrigins().has(recoveredUrl.origin)) {
        return NextResponse.json({ error: "Media source is not allowed" }, { status: 403 });
      }
      return proxyRemoteMedia(
        request,
        recoveredUrl,
        download,
        requestedFilename || recovered.filename,
      );
    }
    return NextResponse.json({ error: "Media not found" }, { status: 404 });
  }

  if (mediaUrl.origin === request.nextUrl.origin && /^\/uploads\//i.test(mediaUrl.pathname)) {
    if (metadata) {
      return metadataResponse(await recoverStoredMedia(mediaUrl));
    }
    const recovered = await recoverStoredMedia(mediaUrl);
    if (recovered) {
      const recoveredUrl = new URL(recovered.url);
      if (!allowedRemoteOrigins().has(recoveredUrl.origin)) {
        return NextResponse.json({ error: "Media source is not allowed" }, { status: 403 });
      }
      return proxyRemoteMedia(
        request,
        recoveredUrl,
        download,
        requestedFilename || recovered.filename,
      );
    }
    return NextResponse.json({ error: "Media not found in ImageKit" }, { status: 404 });
  }

  if (!allowedRemoteOrigins().has(mediaUrl.origin)) {
    return NextResponse.json({ error: "Media source is not allowed" }, { status: 403 });
  }

  // Never proxy the resolver back into itself.
  if (/^\/api\/media\/resolve(?:\/|$)/i.test(mediaUrl.pathname)) {
    return NextResponse.json({ error: "Invalid media URL" }, { status: 400 });
  }

  if (metadata) {
    return metadataResponse({
      kind: "remote",
      url: mediaUrl.toString(),
      filename: requestedFilename || basenameFromMediaUrl(mediaUrl) || "document",
    });
  }

  const remoteResponse = await proxyRemoteMedia(request, mediaUrl, download, requestedFilename);
  if (remoteResponse.status !== 404) {
    return remoteResponse;
  }

  const recovered = await recoverStoredMedia(mediaUrl);
  if (recovered) {
    const recoveredUrl = new URL(recovered.url);
    if (!allowedRemoteOrigins().has(recoveredUrl.origin)) {
      return NextResponse.json({ error: "Media source is not allowed" }, { status: 403 });
    }
    return proxyRemoteMedia(
      request,
      recoveredUrl,
      download,
      requestedFilename || recovered.filename,
    );
  }
  return remoteResponse;
}

export function mediaCorsOptions(): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Range",
      "Access-Control-Max-Age": "86400",
    },
  });
}
