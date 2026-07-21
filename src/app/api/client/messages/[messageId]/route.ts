import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/db/connection";
import Message from "@/lib/db/models/Message";
import GroupMessage from "@/lib/db/models/GroupMessage";
import { File } from "@/lib/db/models/File";
import { deleteImageKitAssets } from "@/lib/imagekit-storage";
import { socketManager } from "@/lib/realtime/socket-manager";

// DELETE /api/client/messages/[messageId] - Delete a message
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { messageId } = await params;

    if (!messageId) {
      return NextResponse.json(
        { error: "Message ID is required" },
        { status: 400 },
      );
    }

    await connectDB();

    // Find the message and verify ownership
    const message = await Message.findById(messageId);

    if (!message) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    // Only allow sender to delete their own messages
    if (message.sender.toString() !== session.user.id) {
      return NextResponse.json(
        { error: "You can only delete your own messages" },
        { status: 403 },
      );
    }

    const attachmentQueries = (message.attachments || []).map(
      (attachment: any) => ({
        $or: [
          ...(attachment.fileId ? [{ _id: attachment.fileId }] : []),
          { imageKitUrl: attachment.url },
          { localPath: attachment.url },
        ],
      }),
    );
    const fileRecords = attachmentQueries.length
      ? await File.find({ $or: attachmentQueries })
      : [];
    const unreferencedFiles = (
      await Promise.all(
        fileRecords.map(async (file) => {
          const attachmentMatch = {
            $or: [
              { "attachments.fileId": file._id },
              ...(file.imageKitUrl
                ? [{ "attachments.url": file.imageKitUrl }]
                : []),
            ],
          };
          const [directReference, groupReference] = await Promise.all([
            Message.exists({ _id: { $ne: message._id }, ...attachmentMatch }),
            GroupMessage.exists(attachmentMatch),
          ]);
          return directReference || groupReference ? null : file;
        }),
      )
    ).filter(Boolean) as typeof fileRecords;

    await deleteImageKitAssets(
      unreferencedFiles.map((file) => ({
        fileId: file.imageKitFileId,
        url: file.imageKitUrl,
      })),
    );
    if (unreferencedFiles.length) {
      await File.deleteMany({
        _id: { $in: unreferencedFiles.map((file) => file._id) },
      });
    }

    // Delete the message
    await Message.findByIdAndDelete(messageId);

    // Notify the receiver about the deleted message via socket
    const receiverId = message.receiver.toString();
    socketManager.sendToUser(receiverId, "message_deleted", {
      messageId,
      conversationWith: session.user.id,
      timestamp: Date.now(),
    });

    // Also notify the sender (for syncing across devices)
    socketManager.sendToUser(session.user.id, "message_deleted", {
      messageId,
      conversationWith: receiverId,
      timestamp: Date.now(),
    });

    return NextResponse.json({
      success: true,
      message: "Message deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting message:", error);
    return NextResponse.json(
      { error: "Failed to delete message" },
      { status: 500 },
    );
  }
}
