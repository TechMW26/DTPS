import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { uploadToBlob } from "@/lib/storage/blob-storage";
import {
  compressImageServer,
  serverCompressionPresets,
} from "@/lib/imageCompressionServer";
import { UserRole } from "@/types";

/**
 * POST /api/upload-image
 * Upload a compressed image to Vercel Blob
 * Used for recipe images, user avatars, etc.
 * Images are automatically compressed using Sharp before upload
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is dietitian or admin
    if (
      session.user.role !== UserRole.ADMIN &&
      session.user.role !== UserRole.DIETITIAN
    ) {
      return NextResponse.json(
        { error: "Only dietitians and admins can upload images" },
        { status: 403 },
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;
    const folder = (formData.get("folder") as string) || "recipes";
    const skipCompression = formData.get("skipCompression") === "true";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Convert File to Buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const originalSize = buffer.length;

    // Determine compression settings based on folder/use case
    const compressionSettings =
      folder === "profile" || folder === "/profile"
        ? serverCompressionPresets.avatar
        : folder === "recipes" || folder === "/recipes"
          ? serverCompressionPresets.recipe
          : {
              quality: 85,
              maxWidth: 1600,
              maxHeight: 1600,
              format: "webp" as const,
            };

    // Compress image before upload (unless it's a GIF or compression is skipped)
    const isGif = file.type === "image/gif";
    const shouldCompress =
      !skipCompression && !isGif && file.type.startsWith("image/");

    let uploadData: Buffer;
    let finalFileName: string;
    let compressedSize = originalSize;

    if (shouldCompress) {
      try {
        uploadData = await compressImageServer(buffer, compressionSettings);
        finalFileName = `${Date.now()}-${file.name.replace(/\.[^/.]+$/, ".webp")}`;
        compressedSize = uploadData.length;
        console.log(
          `[Upload] Compressed ${file.name}: ${(originalSize / 1024).toFixed(1)}KB -> ${(compressedSize / 1024).toFixed(1)}KB (${Math.round((1 - compressedSize / originalSize) * 100)}% reduction)`,
        );
      } catch (compressionError) {
        console.warn(
          "[Upload] Compression failed, uploading original:",
          compressionError,
        );
        uploadData = buffer;
        finalFileName = `${Date.now()}-${file.name}`;
      }
    } else {
      uploadData = buffer;
      finalFileName = `${Date.now()}-${file.name}`;
    }

    // Upload to Vercel Blob
    const blobResult = await uploadToBlob(uploadData, {
      type: folder.includes("profile") ? "avatar" : "recipe-image",
      filename: finalFileName,
      contentType: shouldCompress ? "image/webp" : file.type,
      compress: false,
    });

    if (!blobResult) {
      return NextResponse.json(
        { error: "Media service temporarily unavailable. Please try again shortly.", code: "MEDIA_SERVICE_DOWN" },
        { status: 503 }
      );
    }

    return NextResponse.json({
      success: true,
      url: blobResult.url,
      fileId: blobResult.pathname,
      name: blobResult.filename,
      size: compressedSize,
      originalSize: originalSize,
      compressed: shouldCompress,
    });
  } catch (error) {
    console.error("Image upload error:", error);
    return NextResponse.json(
      { error: "Failed to process image upload" },
      { status: 500 },
    );
  }
}
