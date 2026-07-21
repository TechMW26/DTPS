import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db/connection";
import mongoose from "mongoose";
import { MedicalInfo } from "@/lib/db/models";
import { File as FileModel } from "@/lib/db/models/File";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { withCache, clearCacheByTag } from "@/lib/api/utils";
import { deleteImageKitAsset } from "@/lib/imagekit-storage";

// GET /api/reports/[fileId] - Stream a file from GridFS
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ fileId: string }> },
) {
  try {
    await connectDB();
    const { fileId } = await params;

    if (mongoose.Types.ObjectId.isValid(fileId)) {
      const storedFile = await FileModel.findById(fileId).select("_id").lean();
      if (storedFile) {
        return NextResponse.redirect(
          new URL(`/api/files/${fileId}`, _req.url),
          307,
        );
      }
    }

    const db = mongoose.connection.db;
    if (!db) {
      console.error("Database not connected");
      return NextResponse.json(
        { error: "Database not connected" },
        { status: 500 },
      );
    }

    const bucket = new (mongoose as any).mongo.GridFSBucket(db, {
      bucketName: "medicalReports",
    });

    let id: mongoose.Types.ObjectId;
    try {
      id = new mongoose.Types.ObjectId(fileId);
    } catch (e) {
      console.error("Invalid file ID format:", fileId);
      return NextResponse.json({ error: "Invalid file ID" }, { status: 400 });
    }

    // Find file to get contentType
    const files = await withCache(
      `reports:fileId:${fileId}`,
      async () => await bucket.find({ _id: id }).toArray(),
      { ttl: 120000, tags: ["reports"] },
    );
    if (!files || files.length === 0) {
      console.error("File not found in GridFS:", fileId);
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }
    const fileDoc = files[0] as any;
    const contentType = fileDoc.contentType || "application/octet-stream";

    // Sanitize filename - remove non-ASCII characters and encode for header
    const rawFileName =
      fileDoc.metadata?.originalName || fileDoc.filename || "file";
    const sanitizedFileName =
      rawFileName
        .replace(/[^\x00-\x7F]/g, "_") // Replace non-ASCII chars with underscore
        .replace(/[<>:"/\\|?*]/g, "_") // Replace invalid filename chars
        .trim() || "file";

    // Download file to buffer first
    const chunks: Buffer[] = [];
    const downloadStream = bucket.openDownloadStream(id);

    await new Promise<void>((resolve, reject) => {
      downloadStream.on("data", (chunk: Buffer) => chunks.push(chunk));
      downloadStream.on("error", (err: Error) => {
        console.error("Download stream error:", err);
        reject(err);
      });
      downloadStream.on("end", resolve);
    });

    const fileBuffer = Buffer.concat(chunks);

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": fileBuffer.length.toString(),
        "Content-Disposition": `inline; filename="${sanitizedFileName}"`,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (err) {
    console.error("Error streaming report:", err);
    return NextResponse.json(
      {
        error: "Failed to fetch file",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}

// DELETE /api/reports/[fileId] - Delete a file from GridFS and MedicalInfo
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const { fileId } = await params;

    if (mongoose.Types.ObjectId.isValid(fileId)) {
      const storedFile = await FileModel.findById(fileId);
      if (storedFile) {
        await deleteImageKitAsset({
          fileId: storedFile.imageKitFileId,
          url: storedFile.imageKitUrl,
        });
        await FileModel.findByIdAndDelete(fileId);
        await MedicalInfo.updateMany(
          { "reports.id": fileId },
          { $pull: { reports: { id: fileId } } },
        );
        await clearCacheByTag("reports");
        return NextResponse.json({
          success: true,
          message: "File deleted successfully",
        });
      }
    }

    const db = mongoose.connection.db;
    if (!db) {
      return NextResponse.json(
        { error: "Database not connected" },
        { status: 500 },
      );
    }

    const bucket = new (mongoose as any).mongo.GridFSBucket(db, {
      bucketName: "medicalReports",
    });
    const id = new mongoose.Types.ObjectId(fileId);

    // Check if file exists
    const files = await withCache(
      `reports:fileId:${fileId}`,
      async () => await bucket.find({ _id: id }).toArray(),
      { ttl: 120000, tags: ["reports"] },
    );
    if (!files || files.length === 0) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // Delete file from GridFS
    await bucket.delete(id);

    // Also remove from MedicalInfo records
    await MedicalInfo.updateMany(
      { "reports.id": fileId },
      { $pull: { reports: { id: fileId } } },
    );

    return NextResponse.json({
      success: true,
      message: "File deleted successfully",
    });
  } catch (err) {
    console.error("Error deleting report:", err);
    return NextResponse.json(
      { error: "Failed to delete file" },
      { status: 500 },
    );
  }
}
