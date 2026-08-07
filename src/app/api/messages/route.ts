import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import Message from '@/lib/db/models/Message';
import User from '@/lib/db/models/User';
import { Notification } from '@/lib/db/models';
import { UserRole } from '@/types';
import { socketManager } from '@/lib/realtime/socket-manager';
import { SOCKET_EVENTS } from '@/lib/realtime/socket-events';
import { broadcastUnreadCounts, broadcastStaffUnreadCounts } from '@/lib/realtime/broadcast-counts';
import { createMessageWebhook } from '@/lib/webhooks/webhook-manager';
import { z } from 'zod';
import { logHistoryServer } from '@/lib/server/history';
import { notifyMessageToRecipient } from '@/lib/notifications/staffPushService';
import { clearCacheByTag } from '@/lib/api/utils';

// Message validation schema
const messageSchema = z.object({
  recipientId: z.string().min(1, 'Recipient ID is required'),
  content: z.string().min(1, 'Message content is required').max(2000, 'Message too long'),
  type: z.enum(['text', 'image', 'video', 'audio', 'voice', 'file', 'emoji', 'sticker', 'location', 'contact', 'call_missed']).default('text'),
  attachments: z.array(z.object({
    url: z.string().min(1, 'Attachment URL is required'),
    filename: z.string().min(1, 'Filename is required'),
    size: z.number().min(1, 'File size must be positive'),
    mimeType: z.string().min(1, 'MIME type is required'),
    fileId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
    thumbnail: z.string().optional(),
    duration: z.number().optional(),
    width: z.number().optional(),
    height: z.number().optional()
  })).optional(),
  replyTo: z.string().optional() // For replying to specific messages
});

type UserAssignmentRef = { toString: () => string } | string;

type MessageUserLite = {
  role?: string;
  assignedDietitian?: UserAssignmentRef;
  assignedDietitians?: UserAssignmentRef[];
  assignedHealthCounselor?: UserAssignmentRef;
};

type PopulatedPerson = {
  firstName?: string;
  lastName?: string;
};

type PopulatedMessageDoc = {
  _id: unknown;
  sender?: PopulatedPerson;
  receiver?: PopulatedPerson;
  toJSON: () => {
    _id: unknown;
    sender?: PopulatedPerson;
    receiver?: PopulatedPerson;
  };
};

function getDisplayName(person?: PopulatedPerson): string {
  return `${person?.firstName || ''} ${person?.lastName || ''}`.trim();
}

// GET /api/messages - Get messages for current user
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const conversationWith = searchParams.get('conversationWith');
    const limit = parseInt(searchParams.get('limit') || '50');
    const page = parseInt(searchParams.get('page') || '1');

    const sessionRole = String(session.user.role || '').toLowerCase();

    // STRICT ROLE-BASED VALIDATION for conversation access
    if (conversationWith) {
      const otherUser = await User.findById(conversationWith)
        .select('role assignedDietitian assignedDietitians assignedHealthCounselor')
        .lean<MessageUserLite | null>();

      if (!otherUser) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      const otherRole = String(otherUser.role || '').toLowerCase();

      // Validate access based on roles — only block if cross-role restriction is violated
      // Allow viewing historical conversations even when no longer assigned
      if (sessionRole === 'dietitian') {
        if (otherRole === 'client') {
          const isAssigned =
            otherUser.assignedDietitian?.toString() === session.user.id ||
            otherUser.assignedDietitians?.some((d) => d.toString() === session.user.id);
          // Allow viewing historical messages even if no longer assigned;
          // the query naturally returns only messages between these two users.
          if (!isAssigned) {
            // Still allow — dietitian may have been reassigned but has message history
          }
        }
      } else if (sessionRole === 'health_counselor') {
        if (otherRole === 'client') {
          // Allow viewing even if no longer assigned
        }
      } else if (sessionRole === 'client') {
        // Client can view messages with any staff member they've messaged
        // (previously restricted to primary dietitian only)
      }
      // Admin has no restrictions
    }

    let query: Record<string, unknown> = {};

    if (conversationWith) {
      // Get messages between current user and specific user
      query = {
        $or: [
          { sender: session.user.id, receiver: conversationWith },
          { sender: conversationWith, receiver: session.user.id }
        ]
      };
    } else {
      // Get all messages for current user
      query = {
        $or: [
          { sender: session.user.id },
          { receiver: session.user.id }
        ]
      };
    }

    // NO CACHE for real-time messaging - always fetch fresh data
    // When fetching a specific conversation, get ALL messages (no limit)
    // Only apply limit/pagination when fetching all messages (inbox view)
    const messageQuery = Message.find(query)
      .populate('sender', 'firstName lastName avatar')
      .populate('receiver', 'firstName lastName avatar')
      .populate({
        path: 'replyTo',
        select: 'content type attachments sender createdAt',
        populate: {
          path: 'sender',
          select: 'firstName lastName avatar'
        }
      })
      .sort({ createdAt: 1 }); // Sort oldest first for proper chat order

    // Only apply limit if NOT viewing a specific conversation
    if (!conversationWith) {
      messageQuery.limit(limit).skip((page - 1) * limit);
    }

    const messages = await messageQuery.lean();

    const total = await Message.countDocuments(query);

    // Mark messages as read if viewing conversation
    if (conversationWith) {
      const updateResult = await Message.updateMany(
        {
          sender: conversationWith,
          receiver: session.user.id,
          isRead: false
        },
        { isRead: true, readAt: new Date() }
      );

      // Emit message_read event to the other party so they see read receipts update
      if (updateResult.modifiedCount > 0) {
        socketManager.sendToUser(conversationWith, SOCKET_EVENTS.MESSAGE_READ, {
          conversationWith: session.user.id,
          readBy: session.user.id,
          readAt: new Date().toISOString()
        });

        clearCacheByTag('messages');
      }

      // Broadcast socket update for unread counts
      try {
        const messageCount = await Message.countDocuments({
          receiver: session.user.id,
          isRead: false
        });

        if (sessionRole === 'client') {
          const notificationCount = await Notification.countDocuments({
            userId: session.user.id,
            read: false
          });

          broadcastUnreadCounts(session.user.id, {
            notifications: notificationCount,
            messages: messageCount
          });
        } else {
          broadcastStaffUnreadCounts(session.user.id, { messages: messageCount });
        }
      } catch {
        // Silently handle broadcast errors
      }
    }

    return NextResponse.json({
      messages, // No need to reverse - already in correct order (oldest first)
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Error fetching messages:', error);
    return NextResponse.json(
      { error: 'Failed to fetch messages' },
      { status: 500 }
    );
  }
}

// POST /api/messages - Send new message
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // Validate input
    const validatedData = messageSchema.parse(body);

    await connectDB();

    const sessionRole = String(session.user.role || '').toLowerCase();

    // STRICT ROLE-BASED VALIDATION for sending messages
    const recipientUser = await User.findById(validatedData.recipientId)
      .select('role assignedDietitian assignedDietitians assignedHealthCounselor')
      .lean<MessageUserLite | null>();

    if (!recipientUser) {
      return NextResponse.json({ error: 'Recipient not found' }, { status: 404 });
    }

    const recipientRole = String(recipientUser.role || '').toLowerCase();

    // Validate based on sender role
    if (sessionRole === 'dietitian') {
      // Dietitian can message their assigned clients OR other staff
      if (recipientRole === 'client') {
        const isAssigned =
          recipientUser.assignedDietitian?.toString() === session.user.id ||
          recipientUser.assignedDietitians?.some((d) => d.toString() === session.user.id);
        if (!isAssigned) {
          return NextResponse.json({ error: 'You can only message clients assigned to you' }, { status: 403 });
        }
      }
    } else if (sessionRole === 'health_counselor') {
      // Health Counselor can message their assigned clients OR other staff
      if (recipientRole === 'client') {
        if (recipientUser.assignedHealthCounselor?.toString() !== session.user.id) {
          return NextResponse.json({ error: 'You can only message clients assigned to you' }, { status: 403 });
        }
      }
    } else if (sessionRole === 'client') {
      // Client can ONLY message their PRIMARY assigned dietitian
      const currentUser = await User.findById(session.user.id)
        .select('assignedDietitian')
        .lean<Pick<MessageUserLite, 'assignedDietitian'> | null>();

      const primaryDietitian = currentUser?.assignedDietitian?.toString();

      if (!primaryDietitian || primaryDietitian !== validatedData.recipientId) {
        return NextResponse.json({ error: 'You can only message your primary dietitian' }, { status: 403 });
      }
    }
    // Admin has no restrictions

    // Create message
    const message = new Message({
      sender: session.user.id,
      receiver: validatedData.recipientId,
      content: validatedData.content,
      type: validatedData.type,
      attachments: validatedData.attachments,
      replyTo: validatedData.replyTo,
      isRead: false
    });

    await message.save();

    // Clear messages cache for both sender and recipient
    clearCacheByTag(`messages:${session.user.id}`);
    clearCacheByTag(`messages:${validatedData.recipientId}`);
    clearCacheByTag('messages');

    // Populate the created message
    await message.populate('sender', 'firstName lastName avatar');
    await message.populate('receiver', 'firstName lastName avatar');
    await message.populate({
      path: 'replyTo',
      select: 'content type attachments sender createdAt',
      populate: {
        path: 'sender',
        select: 'firstName lastName avatar'
      }
    });

    // Send real-time notification to BOTH sender and recipient
    const populatedMessage = message as unknown as PopulatedMessageDoc;
    const msgJson = populatedMessage.toJSON();
    const ts = Date.now();

    // Send to recipient — from their perspective the conversation is with the sender
    socketManager.sendToUser(validatedData.recipientId, 'new_message', {
      message: msgJson,
      conversationWith: session.user.id,
      timestamp: ts
    });

    // Send to sender — from their perspective the conversation is with the recipient
    socketManager.sendToUser(session.user.id, 'new_message', {
      message: msgJson,
      conversationWith: validatedData.recipientId,
      timestamp: ts
    });

    // Trigger webhook for message sent
    await createMessageWebhook(message.toJSON(), 'sent');

    // Send push notification only when CLIENT sends message to staff
    // Staff (dietitian/health_counselor/admin) don't need notifications for messages they send
    if (sessionRole === UserRole.CLIENT) {
      const senderName = getDisplayName(populatedMessage.sender);
      try {
        await notifyMessageToRecipient({
          recipientId: validatedData.recipientId,
          recipientRole,
          senderName: senderName || 'A user',
          senderRole: sessionRole,
          messagePreview: validatedData.content,
          messageId: String(populatedMessage._id),
          conversationWithUserId: session.user.id,
          clientId: session.user.id,
          clientName: senderName || 'Client',
        });
      } catch (notifError) {
        console.error('Failed to send push notification:', notifError);
        // Don't fail message delivery if push send fails
      }
    } else if (recipientRole === UserRole.CLIENT) {
      // Send push notification to CLIENT when staff (dietitian/health_counselor/admin) sends message
      const senderName = getDisplayName(populatedMessage.sender);
      const recipientName = getDisplayName(populatedMessage.receiver);
      try {
        await notifyMessageToRecipient({
          recipientId: validatedData.recipientId,
          recipientRole: UserRole.CLIENT,
          senderName: senderName || 'Your Care Team',
          senderRole: sessionRole,
          messagePreview: validatedData.content,
          messageId: String(populatedMessage._id),
          conversationWithUserId: session.user.id,
          clientId: validatedData.recipientId,
          clientName: recipientName || 'Client',
        });
      } catch (notifError) {
        console.error('Failed to send push notification to client:', notifError);
        // Don't fail message delivery if push send fails
      }
    }



    // Log history for message sent (for both sender and recipient)
    await logHistoryServer({
      userId: validatedData.recipientId,
      action: 'create',
      category: 'other',
      description: `Message received from ${session.user.role}`,
      performedById: session.user.id,
      metadata: {
        messageId: message._id,
        type: validatedData.type,
        hasAttachments: (validatedData.attachments || []).length > 0
      }
    });

    // Real-time unread badge updates for recipient
    try {
      const recipientMessageCount = await Message.countDocuments({
        receiver: validatedData.recipientId,
        isRead: false
      });

      if (recipientRole === 'client') {
        const recipientNotificationCount = await Notification.countDocuments({
          userId: validatedData.recipientId,
          read: false
        });

        broadcastUnreadCounts(validatedData.recipientId, {
          notifications: recipientNotificationCount,
          messages: recipientMessageCount
        });
      } else {
        broadcastStaffUnreadCounts(validatedData.recipientId, {
          messages: recipientMessageCount
        });
      }
    } catch (countError) {
      console.error('Failed to broadcast unread counts:', countError);
    }

    return NextResponse.json(message, { status: 201 });

  } catch (error) {
    console.error('Error sending message:', error);
    return NextResponse.json(
      { error: 'Failed to send message' },
      { status: 500 }
    );
  }
}
