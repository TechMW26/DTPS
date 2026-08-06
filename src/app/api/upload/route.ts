import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import connectDB from "@/lib/db/connection";
import { File as FileModel } from "@/lib/db/models/File";
import { uploadToBlob, deleteFromBlob } from "@/lib/storage/blob-storage";
import { serverCompressionPresets } from "@/lib/imageCompressionServer";

export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;
    const type = formData.get("type") as string;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Reject empty files
    if (!file.size || file.size === 0) {
      return NextResponse.json(
        { error: "Empty file. Please re-record your audio or re-select the file." },
        { status: 400 }
      );
    }

    // Validate file type and size
    const allowedTypes = {
      avatar: ["image/jpeg", "image/png", "image/webp"],
      document: [
        "application/pdf",
        "image/jpeg",
        "image/png",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "text/plain",
      ],
      "recipe-image": ["image/jpeg", "image/png", "image/webp"],
      message: [
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp",
        "image/gif",
        "image/heic",
        "image/heif",
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-powerpoint",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/zip",
        "application/x-zip-compressed",
        "text/plain",
        "audio/mpeg",
        "audio/wav",
        "audio/webm",
        "audio/ogg",
        "audio/mp4",
        "audio/aac",
        "audio/x-m4a",
        "audio/flac",
        "audio/opus",
        "audio/webm;codecs=opus",
        "audio/3gpp",
        "audio/amr",
        "audio/amr-wb",
        "audio/x-wav",
        "audio/mp3",
        "audio/mpeg3",
        "audio/x-mpeg-3",
        "video/mp4",
        "video/webm",
        "video/quicktime",
        "video/x-msvideo",
        "video/x-matroska",
      ],
      "note-attachment": [
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif",
        "video/mp4",
        "video/webm",
        "video/quicktime",
        "audio/mpeg",
        "audio/wav",
        "audio/ogg",
        "audio/mp4",
        "audio/webm",
        "audio/x-m4a",
        "audio/aac",
      ],
      progress: ["image/jpeg", "image/png", "image/webp"],
      "progress-photo": ["image/jpeg", "image/png", "image/webp"],
      "medical-report": [
        "image/jpeg",
        "image/png",
        "image/webp",
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ],
      bug: ["image/jpeg", "image/png", "image/webp", "image/gif"],
      ecommerce: ["image/jpeg", "image/png", "image/webp"],
      transformation: ["image/jpeg", "image/png", "image/webp"],
    };

    const maxSizes = {
      avatar: 5 * 1024 * 1024, // 5MB
      document: 10 * 1024 * 1024, // 10MB
      "recipe-image": 10 * 1024 * 1024, // 10MB
      message: 25 * 1024 * 1024, // 25MB for messages (images, videos, audio)
      "note-attachment": 50 * 1024 * 1024, // 50MB for note attachments
      progress: 10 * 1024 * 1024, // 10MB for progress photos
      "progress-photo": 10 * 1024 * 1024, // 10MB for progress photos
      "medical-report": 10 * 1024 * 1024, // 10MB for medical reports
      bug: 10 * 1024 * 1024, // 10MB for bug screenshots
      ecommerce: 10 * 1024 * 1024, // 10MB for ecommerce images
      transformation: 10 * 1024 * 1024, // 10MB for transformation photos
    };

    const fileType = type as keyof typeof allowedTypes;
    const normalizedMimeType = (file.type || "").toLowerCase();
    const rawExtension = (file.name || "").split(".").pop()?.toLowerCase() || "";
    const extension = rawExtension ? `.${rawExtension}` : "";

    // Message uploads: broad acceptance via MIME prefix + extension fallback
    const messageAllowedExtensions = new Set([
      ".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".heif",
      ".mp4", ".webm", ".mov", ".avi", ".mkv",
      ".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac", ".opus", ".3gpp", ".amr",
      ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".csv", ".txt", ".rtf", ".zip",
    ]);

    const imageAllowedExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".heif"]);
    const documentAllowedExtensions = new Set([".pdf", ".doc", ".docx", ".xls", ".xlsx", ".txt"]);

    const isMessageTypeAllowed =
      fileType === "message" &&
      (allowedTypes[fileType]?.includes(normalizedMimeType) ||
        normalizedMimeType.startsWith("image/") ||
        normalizedMimeType.startsWith("video/") ||
        normalizedMimeType.startsWith("audio/") ||
        normalizedMimeType.startsWith("application/") ||
        messageAllowedExtensions.has(extension) ||
        normalizedMimeType === "");

    const imageBasedTypes = new Set(["avatar", "recipe-image", "progress", "progress-photo", "ecommerce", "transformation", "bug", "medical-report", "document", "note-attachment"]);
    const isImageTypeAllowedByExtension =
      imageBasedTypes.has(fileType as string) &&
      (normalizedMimeType === "" || normalizedMimeType.startsWith("image/")) &&
      imageAllowedExtensions.has(extension);

    const documentBasedTypes = new Set(["medical-report", "document"]);
    const isDocumentTypeAllowedByExtension =
      documentBasedTypes.has(fileType as string) &&
      normalizedMimeType === "" &&
      documentAllowedExtensions.has(extension);

    if (
      !isMessageTypeAllowed &&
      !isImageTypeAllowedByExtension &&
      !isDocumentTypeAllowedByExtension &&
      !allowedTypes[fileType]?.includes(normalizedMimeType)
    ) {
      return NextResponse.json({ error: "Invalid file type" }, { status: 400 });
    }

    if (file.size > maxSizes[fileType]) {
      return NextResponse.json({ error: "File too large" }, { status: 400 });
    }

    // Generate unique filename
    const timestamp = Date.now();
    const fileExtension = file.name.split(".").pop();
    const fileName = `${session.user.id}-${timestamp}.${fileExtension}`;

    // Convert file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Diagnostic logging for audio/video files
    if (normalizedMimeType.startsWith("audio/") || normalizedMimeType.startsWith("video/")) {
      console.log(`[Upload] Received ${fileType} file:`, {
        name: file.name, size: file.size, mimeType: file.type,
        bufferBytes: buffer.length, extension: fileExtension,
      });
    }

    // Compression settings
    const compressibleImages = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif"]);
    const shouldCompress = compressibleImages.has(normalizedMimeType);
    const compressionSettings =
      fileType === "avatar"
        ? serverCompressionPresets.avatar
        : { maxWidth: 1600, maxHeight: 1600, quality: 85, format: "webp" as const };

    // Upload to Vercel Blob
    const blobResult = await uploadToBlob(buffer, {
      type: fileType as any,
      filename: fileName,
      contentType: file.type,
      compress: shouldCompress,
      compressionSettings,
    });

    if (!blobResult) {
      console.error(`[Upload] Vercel Blob upload failed for ${fileType}/${fileName}`);
      return NextResponse.json(
        { error: "Media service temporarily unavailable. Please try again shortly.", code: "MEDIA_SERVICE_DOWN", retryAfter: 60 },
        { status: 503 }
      );
    }

    // Normalize MIME type: strip codec suffix
    const responseMimeType = blobResult.contentType.replace(/;.*$/, "").trim();

    // Save metadata to DB (reuse imageKit fields as blobUrl/pathname during transition)
    const savedFile = await FileModel.create({
      filename: fileName,
      originalName: file.name,
      mimeType: responseMimeType,
      size: file.size,
      type: fileType,
      imageKitFileId: blobResult.pathname,
      imageKitUrl: blobResult.url,
      uploadedBy: session.user.id,
    });

    console.log(`[Upload] ✅ Stored on Vercel Blob: ${blobResult.url} (${file.size} bytes, ${responseMimeType})`);

    return NextResponse.json({
      url: blobResult.url,
      canonicalUrl: `/api/files/${savedFile._id}`,
      dbUrl: `/api/files/${savedFile._id}`,
      imageKitUrl: blobResult.url,
      storage: "vercel-blob",
      filename: fileName,
      size: file.size,
      type: responseMimeType,
      fileId: savedFile._id,
      imageKitFileId: blobResult.pathname,
    });
  } catch (error) {
    console.error("Error uploading file:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to upload file";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await connectDB();

    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const fileId = searchParams.get("fileId");

    if (!fileId) {
      return NextResponse.json({ error: "No file ID provided" }, { status: 400 });
    }

    const fileRecord = await FileModel.findOne({
      _id: fileId,
      uploadedBy: session.user.id,
    });

    if (!fileRecord) {
      return NextResponse.json({ error: "File not found or unauthorized" }, { status: 404 });
    }

    // Delete from Vercel Blob (use pathname or URL)
    const blobRef = fileRecord.imageKitFileId || fileRecord.imageKitUrl;
    if (blobRef) {
      await deleteFromBlob(blobRef);
    }

    await FileModel.findByIdAndDelete(fileId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting file:", error);
    return NextResponse.json({ error: "Failed to delete file" }, { status: 500 });
  }
}
