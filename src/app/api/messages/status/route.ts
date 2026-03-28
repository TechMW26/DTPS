import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import Message from '@/lib/db/models/Message';
import { Notification } from '@/lib/db/models';
import { socketManager } from '@/lib/realtime/socket-manager';
import { broadcastUnreadCounts } from '@/lib/realtime/broadcast-counts';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

// PUT /api/messages/status - Update message status
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { messageId, status, conversationWith } = await request.json();

    await connectDB();

    if (messageId) {
      // Update specific message status
      const message = await withCache(
        `messages:status:${JSON.stringify(messageId)}`,
        async () => await Message.findById(messageId),
        { ttl: 30000, tags: ['messages'] }
      );
      if (!message) {
        return NextResponse.json({ error: 'Message not found' }, { status: 404 });
      }

      // Only allow receiver to mark as read/delivered
      if (message.receiver.toString() !== session.user.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      let updatedMessage;
      switch (status) {
        case 'delivered':
          updatedMessage = await message.markAsDelivered();
          break;
        case 'read':
          updatedMessage = await message.markAsRead();
          break;
        case 'failed':
          updatedMessage = await message.markAsFailed();
          break;
        default:
          return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
      }

      // Send real-time notification to sender
      socketManager.sendToUser(message.sender.toString(), 'message_status_update', {
        messageId: message._id,
        status: updatedMessage.status,
        timestamp: Date.now()
      });

      return NextResponse.json({ message: updatedMessage });

    } else if (conversationWith && status === 'read') {
      // Mark entire conversation as read
      const result = await (Message as any).markConversationAsRead(
        conversationWith,
        session.user.id
      );

      // Send real-time notification to sender
      socketManager.sendToUser(conversationWith, 'conversation_read', {
        readBy: session.user.id,
        timestamp: Date.now(),
        messagesCount: result.modifiedCount
      });

      // Broadcast unread count update via SSE
      const [notificationCount, messageCount] = await Promise.all([
        Notification.countDocuments({ userId: session.user.id, read: false }),
        Message.countDocuments({ receiver: session.user.id, isRead: false })
      ]);

      broadcastUnreadCounts(session.user.id, {
        notifications: notificationCount,
        messages: messageCount
      });

      return NextResponse.json({
        message: 'Conversation marked as read',
        updatedCount: result.modifiedCount
      });

    } else {
      return NextResponse.json({
        error: 'Either messageId or conversationWith is required'
      }, { status: 400 });
    }

  } catch (error) {
    console.error('Error updating message status:', error);
    return NextResponse.json(
      { error: 'Failed to update message status' },
      { status: 500 }
    );
  }
}

// GET /api/messages/status - Get message delivery status
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const conversationWith = searchParams.get('conversationWith');

    if (!conversationWith) {
      return NextResponse.json({
        error: 'conversationWith parameter is required'
      }, { status: 400 });
    }

    await connectDB();

    // Get delivery status for messages in conversation
    const statusCounts = await withCache(
      `messages:status:${JSON.stringify([
        {
          $match: {
            $or: [
              { sender: session.user.id, receiver: conversationWith },
              { sender: conversationWith, receiver: session.user.id }
            ]
          }
        },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ])}`,
      async () => await Message.aggregate([
        {
          $match: {
            $or: [
              { sender: session.user.id, receiver: conversationWith },
              { sender: conversationWith, receiver: session.user.id }
            ]
          }
        },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]),
      { ttl: 30000, tags: ['messages'] }
    );

    // Get unread count for current user
    const unreadCount = await Message.countDocuments({
      sender: conversationWith,
      receiver: session.user.id,
      isRead: false
    });

    // Get last seen timestamps
    const lastReadMessage = await withCache(
      `messages:status:${JSON.stringify({
        sender: conversationWith,
        receiver: session.user.id,
        isRead: true
      })}`,
      async () => await Message.findOne({
        sender: conversationWith,
        receiver: session.user.id,
        isRead: true
      }).sort({ readAt: -1 }),
      { ttl: 30000, tags: ['messages'] }
    );

    return NextResponse.json({
      statusCounts: statusCounts.reduce((acc: any, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      unreadCount,
      lastReadAt: lastReadMessage?.readAt || null
    });

  } catch (error) {
    console.error('Error fetching message status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch message status' },
      { status: 500 }
    );
  }
}
