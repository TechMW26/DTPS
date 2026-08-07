import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getToken } from "next-auth/jwt";
import { after, NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db/connection";
import FileModel from "@/lib/db/models/File";

export const runtime = "nodejs";

const uploadRules = {
  avatar: { folder: "profile", max: 5 * 1024 * 1024, prefixes: ["image/"] },
  document: { folder: "documents", max: 10 * 1024 * 1024, prefixes: ["image/", "application/", "text/"] },
  "recipe-image": { folder: "recipes", max: 10 * 1024 * 1024, prefixes: ["image/"] },
  message: { folder: "messages", max: 25 * 1024 * 1024, prefixes: ["image/", "video/", "audio/", "application/", "text/"] },
  "note-attachment": { folder: "notes", max: 50 * 1024 * 1024, prefixes: ["image/", "video/", "audio/", "application/", "text/"] },
  progress: { folder: "progress", max: 15 * 1024 * 1024, prefixes: ["image/"] },
  "progress-photo": { folder: "transformation", max: 10 * 1024 * 1024, prefixes: ["image/"] },
  "medical-report": { folder: "medical-reports", max: 10 * 1024 * 1024, prefixes: ["image/", "application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument"] },
  ecommerce: { folder: "ecommerce", max: 10 * 1024 * 1024, prefixes: ["image/"] },
  transformation: { folder: "transformations", max: 10 * 1024 * 1024, prefixes: ["image/"] },
  bug: { folder: "bug", max: 10 * 1024 * 1024, prefixes: ["image/"] },
} as const;

type UploadType = keyof typeof uploadRules;

interface ClientPayload {
  uploadType: UploadType;
  originalName: string;
  mimeType: string;
  size: number;
}

interface TokenPayload extends ClientPayload {
  userId: string;
}

function parsePayload<T>(value: string | null): T {
  if (!value) throw new Error("Missing upload metadata");
  return JSON.parse(value) as T;
}

function isAllowedMimeType(mimeType: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => mimeType === prefix || mimeType.startsWith(prefix));
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as HandleUploadBody;
    const response = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname, rawPayload) => {
        // Decode the signed JWT directly. Calling getServerSession here can run
        // session callbacks and make Blob token issuance depend on MongoDB.
        const token = await getToken({
          req: request,
          secret: process.env.NEXTAUTH_SECRET,
        });
        if (!token?.sub) throw new Error("Unauthorized");

        const payload = parsePayload<ClientPayload>(rawPayload);
        const rule = uploadRules[payload.uploadType];
        const mimeType = String(payload.mimeType || "").toLowerCase();

        if (!rule || !pathname.startsWith(`${rule.folder}/`)) {
          throw new Error("Invalid upload destination");
        }
        if (!Number.isFinite(payload.size) || payload.size <= 0 || payload.size > rule.max) {
          throw new Error("File is too large or empty");
        }
        if (!isAllowedMimeType(mimeType, rule.prefixes)) {
          throw new Error("Unsupported file type");
        }

        return {
          allowedContentTypes: [mimeType],
          maximumSizeInBytes: rule.max,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ ...payload, userId: token.sub }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const payload = parsePayload<TokenPayload>(tokenPayload || null);
        // The file is already safely in Blob storage. Persist metadata after
        // acknowledging the callback so a transient Mongo outage cannot make a
        // successful media upload appear to have failed in the client.
        after(async () => {
          try {
            await connectDB();
            await FileModel.updateOne(
              { imageKitFileId: blob.pathname },
              {
                $setOnInsert: {
                  filename: blob.pathname.split("/").pop() || payload.originalName,
                  originalName: payload.originalName,
                  mimeType: payload.mimeType,
                  size: payload.size,
                  type: payload.uploadType,
                  imageKitFileId: blob.pathname,
                  imageKitUrl: blob.url,
                  uploadedBy: payload.userId,
                },
              },
              { upsert: true },
            );
          } catch (metadataError) {
            console.error("[ClientUpload] Blob uploaded but metadata persistence failed:", metadataError);
          }
        });
      },
    });

    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    const status = message === "Unauthorized" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
