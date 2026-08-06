import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import connectDB from "@/lib/db/connection";
import User from "@/lib/db/models/User";
import mongoose from "mongoose";
import { File as FileModel } from "@/lib/db/models/File";
import { deleteFromBlob } from "@/lib/storage/blob-storage";

// DELETE /api/admin/clients/[clientId]/documents - Delete a document
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  try {
    const [session, , { clientId }] = await Promise.all([
      getServerSession(authOptions),
      connectDB(),
      params,
    ]);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRole = session.user.role?.toLowerCase();
    if (!userRole || !userRole.includes("admin")) {
      return NextResponse.json(
        { error: "Forbidden - Admin access required" },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(request.url);
    const documentId = searchParams.get("documentId");
    const filePath = searchParams.get("filePath");

    if (!documentId) {
      return NextResponse.json(
        { error: "Document ID is required" },
        { status: 400 },
      );
    }

    const client = await User.findById(clientId);
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    // Find and remove the document
    const documentIndex = client.documents?.findIndex(
      (doc: any) => doc._id.toString() === documentId,
    );

    if (documentIndex === -1 || documentIndex === undefined) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 },
      );
    }

    const document = client.documents[documentIndex];

    const storedFileId = document.filePath?.split("/").pop();
    if (storedFileId && mongoose.Types.ObjectId.isValid(storedFileId)) {
      const storedFile = await FileModel.findById(storedFileId);
      if (storedFile) {
        await deleteFromBlob(storedFile.imageKitFileId || storedFile.imageKitUrl);
        await FileModel.findByIdAndDelete(storedFileId);
      }
    }

    // Legacy local file cleanup removed — all media is on Vercel Blob.
    // deleteFromBlob above handles the CDN removal.

    // Remove from database
    client.documents.splice(documentIndex, 1);
    await client.save();

    return NextResponse.json({
      message: "Document deleted successfully",
      documentsCount: client.documents.length,
    });
  } catch (error) {
    console.error("Error deleting document:", error);
    return NextResponse.json(
      { error: "Failed to delete document" },
      { status: 500 },
    );
  }
}
