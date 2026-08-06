import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import connectDB from "@/lib/db/connection";
import ClientNote from "@/lib/db/models/ClientNote";
import mongoose from "mongoose";
import { logHistoryServer } from "@/lib/server/history";
import { clearCacheByTag } from "@/lib/api/utils";
import { File as FileModel } from "@/lib/db/models/File";
import { deleteMultipleFromBlob } from "@/lib/storage/blob-storage";

// DELETE /api/users/[id]/notes/[noteId] - Delete a note
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> },
) {
  try {
    const [session, , { id, noteId }] = await Promise.all([
      getServerSession(authOptions),
      connectDB(),
      params,
    ]);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Admins, dietitians, and health counselors can delete notes
    const allowedRoles = ["admin", "dietitian", "health_counselor"];
    const userRole = session.user.role?.toLowerCase();
    if (!allowedRoles.includes(userRole)) {
      return NextResponse.json(
        {
          error:
            "Access denied. Only admin, dietitian, and health counselor can delete notes.",
        },
        { status: 403 },
      );
    }

    const clientObjectId = new mongoose.Types.ObjectId(id);
    const noteObjectId = new mongoose.Types.ObjectId(noteId);

    // Build query - HC and dietitian can only delete their own notes (admin can delete any)
    const deleteQuery: any = {
      _id: noteObjectId,
      client: clientObjectId,
    };

    // Both health_counselor and dietitian can only delete notes they created
    if (userRole === "health_counselor" || userRole === "dietitian") {
      deleteQuery.createdBy = new mongoose.Types.ObjectId(session.user.id);
    }

    const result = await ClientNote.findOne(deleteQuery);

    if (!result) {
      return NextResponse.json(
        { error: "Note not found or you do not have permission to delete it" },
        { status: 404 },
      );
    }

    const attachmentUrls = (result.attachments || []).map(
      (attachment: any) => attachment.url,
    );
    const fileRecords = attachmentUrls.length
      ? await FileModel.find({ imageKitUrl: { $in: attachmentUrls } })
      : [];
    const recordsByUrl = new Map(
      fileRecords.map((file: any) => [file.imageKitUrl, file]),
    );
    await deleteMultipleFromBlob(
      attachmentUrls.filter((url: string) => url).map((url: string) => url),
    );
    if (fileRecords.length) {
      await FileModel.deleteMany({
        _id: { $in: fileRecords.map((file: any) => file._id) },
      });
    }
    await ClientNote.deleteOne({ _id: result._id });

    // Log history for note deletion
    await logHistoryServer({
      userId: id,
      action: "delete",
      category: "other",
      description: `Note deleted: ${result.topicType || "General"}`,
      performedById: session.user.id,
      metadata: {
        noteId,
        topicType: result.topicType,
      },
    });

    await clearCacheByTag("users");
    await clearCacheByTag(`users:id:${id}`);
    await clearCacheByTag(`users:id:notes:${id}`);
    await clearCacheByTag("client");
    await clearCacheByTag(`client:${id}`);

    return NextResponse.json({
      success: true,
      message: "Note deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting note:", error);
    return NextResponse.json(
      { error: "Failed to delete note" },
      { status: 500 },
    );
  }
}

// PATCH /api/users/[id]/notes/[noteId] - Update a note (toggle visibility, etc.)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> },
) {
  try {
    const [session, body, { id, noteId }] = await Promise.all([
      getServerSession(authOptions),
      request.json(),
      params,
    ]);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Admins, dietitians, and health counselors can update notes
    const allowedRoles = ["admin", "dietitian", "health_counselor"];
    const userRole = session.user.role?.toLowerCase();
    if (!allowedRoles.includes(userRole)) {
      return NextResponse.json(
        {
          error:
            "Access denied. Only admin, dietitian, and health counselor can update notes.",
        },
        { status: 403 },
      );
    }

    await connectDB();

    const clientObjectId = new mongoose.Types.ObjectId(id);
    const noteObjectId = new mongoose.Types.ObjectId(noteId);

    // Build update query - health counselors can only update their own notes
    const updateQuery: any = { _id: noteObjectId, client: clientObjectId };
    if (userRole === "health_counselor") {
      updateQuery.createdBy = new mongoose.Types.ObjectId(session.user.id);
    }

    // Build update object with only provided fields
    const updateFields: any = {};
    if (body.topicType !== undefined) updateFields.topicType = body.topicType;
    if (body.date !== undefined) updateFields.date = new Date(body.date);
    if (body.content !== undefined) updateFields.content = body.content;
    if (body.showToClient !== undefined)
      updateFields.showToClient = body.showToClient;
    if (body.attachments !== undefined)
      updateFields.attachments = body.attachments;

    const updatedNote = await ClientNote.findOneAndUpdate(
      updateQuery,
      { $set: updateFields },
      { new: true },
    );

    if (!updatedNote) {
      return NextResponse.json(
        { error: "Note not found or you do not have permission to update it" },
        { status: 404 },
      );
    }

    // Log history for note update (only visibility toggle is allowed now)
    if (body.showToClient !== undefined) {
      await logHistoryServer({
        userId: id,
        action: "update",
        category: "other",
        description: `Note visibility changed: ${updatedNote.topicType || "General"} - ${body.showToClient ? "visible to client" : "hidden from client"}`,
        performedById: session.user.id,
        metadata: {
          noteId,
          topicType: updatedNote.topicType,
          showToClient: body.showToClient,
        },
      });
    }

    await updatedNote.populate("createdBy", "firstName lastName");

    await clearCacheByTag("users");
    await clearCacheByTag(`users:id:${id}`);
    await clearCacheByTag(`users:id:notes:${id}`);
    await clearCacheByTag("client");
    await clearCacheByTag(`client:${id}`);

    return NextResponse.json({
      success: true,
      note: {
        _id: updatedNote._id.toString(),
        topicType: updatedNote.topicType || "General",
        date: updatedNote.date,
        content: updatedNote.content,
        showToClient: updatedNote.showToClient,
        attachments: updatedNote.attachments || [],
        createdAt: updatedNote.createdAt,
        createdBy: updatedNote.createdBy
          ? {
              _id: (updatedNote.createdBy as any)._id?.toString?.() || "",
              firstName: (updatedNote.createdBy as any).firstName || "",
              lastName: (updatedNote.createdBy as any).lastName || "",
            }
          : null,
      },
    });
  } catch (error) {
    console.error("Error updating note:", error);
    return NextResponse.json(
      { error: "Failed to update note" },
      { status: 500 },
    );
  }
}
