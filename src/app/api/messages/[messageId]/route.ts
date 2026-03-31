import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import Message from '@/lib/db/models/Message';
import { File } from '@/lib/db/models/File';
import { getImageKit } from '@/lib/imagekit';
import { socketManager } from '@/lib/realtime/socket-manager';

// DELETE /api/messages/[messageId] - Delete a message (for all roles)
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ messageId: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { messageId } = await params;

        if (!messageId) {
            return NextResponse.json({ error: 'Message ID is required' }, { status: 400 });
        }

        await connectDB();

        // Find the message and verify ownership
        const message = await Message.findById(messageId);

        if (!message) {
            return NextResponse.json({ error: 'Message not found' }, { status: 404 });
        }

        // Only allow sender to delete their own messages
        if (message.sender.toString() !== session.user.id) {
            return NextResponse.json({ error: 'You can only delete your own messages' }, { status: 403 });
        }

        // If message has attachments, delete them from ImageKit
        if (message.attachments && message.attachments.length > 0) {
            for (const attachment of message.attachments) {
                try {
                    // Try to find the file record to get ImageKit fileId
                    const fileRecord = await File.findOne({
                        $or: [
                            { imageKitUrl: attachment.url },
                            { localPath: attachment.url }
                        ]
                    });

                    if (fileRecord?.imageKitFileId) {
                        try {
                            const ik = getImageKit();
                            await ik.deleteFile(fileRecord.imageKitFileId);
                            console.log(`[Delete Message] Deleted file from ImageKit: ${fileRecord.imageKitFileId}`);
                        } catch (ikError) {
                            console.warn('[Delete Message] Failed to delete from ImageKit:', ikError);
                            // Continue even if ImageKit deletion fails
                        }

                        // Delete the file record from database
                        await File.findByIdAndDelete(fileRecord._id);
                    }
                } catch (fileError) {
                    console.error('[Delete Message] Error handling attachment deletion:', fileError);
                    // Continue with message deletion even if attachment deletion fails
                }
            }
        }

        // Delete the message
        await Message.findByIdAndDelete(messageId);

        // Notify the receiver about the deleted message via socket
        const receiverId = message.receiver.toString();
        socketManager.sendToUser(receiverId, 'message_deleted', {
            messageId,
            conversationWith: session.user.id,
            timestamp: Date.now()
        });

        // Also notify the sender (for syncing across devices)
        socketManager.sendToUser(session.user.id, 'message_deleted', {
            messageId,
            conversationWith: receiverId,
            timestamp: Date.now()
        });

        return NextResponse.json({
            success: true,
            message: 'Message deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting message:', error);
        return NextResponse.json(
            { error: 'Failed to delete message' },
            { status: 500 }
        );
    }
}
