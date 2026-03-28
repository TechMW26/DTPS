import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import Message from '@/lib/db/models/Message';
import User from '@/lib/db/models/User';
import { UserRole } from '@/types';
import { socketManager } from '@/lib/realtime/socket-manager';
import { createMessageWebhook } from '@/lib/webhooks/webhook-manager';
import { z } from 'zod';
import { logHistoryServer } from '@/lib/server/history';
import { sendNewMessageNotification } from '@/lib/notifications/notificationService';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

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
    thumbnail: z.string().optional(),
    duration: z.number().optional(),
    width: z.number().optional(),
    height: z.number().optional()
  })).optional(),
  replyTo: z.string().optional() // For replying to specific messages
});

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
        .lean();

      if (!otherUser) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      const otherRole = String((otherUser as any).role || '').toLowerCase();

      // Validate access based on roles
      if (sessionRole === 'dietitian') {
        // Dietitian can only message their assigned clients OR other staff
        if (otherRole === 'client') {
          const isAssigned =
            (otherUser as any).assignedDietitian?.toString() === session.user.id ||
            (otherUser as any).assignedDietitians?.some((d: any) => d.toString() === session.user.id);
          if (!isAssigned) {
            return NextResponse.json({ error: 'You can only message clients assigned to you' }, { status: 403 });
          }
        }
        // Staff-to-staff communication is allowed
      } else if (sessionRole === 'health_counselor') {
        // Health Counselor can only message their assigned clients OR other staff
        if (otherRole === 'client') {
          if ((otherUser as any).assignedHealthCounselor?.toString() !== session.user.id) {
            return NextResponse.json({ error: 'You can only message clients assigned to you' }, { status: 403 });
          }
        }
        // Staff-to-staff communication is allowed
      } else if (sessionRole === 'client') {
        // Client can ONLY message their PRIMARY assigned dietitian
        const currentUser = await User.findById(session.user.id)
          .select('assignedDietitian')
          .lean();

        const primaryDietitian = (currentUser as any)?.assignedDietitian?.toString();

        if (!primaryDietitian || primaryDietitian !== conversationWith) {
          return NextResponse.json({ error: 'You can only message your primary dietitian' }, { status: 403 });
        }
      }
      // Admin has no restrictions
    }

    let query: any = {};

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
    const messages = await Message.find(query)
      .populate('sender', 'firstName lastName avatar')
      .populate('receiver', 'firstName lastName avatar')
      .sort({ createdAt: 1 }) // Sort oldest first for proper chat order
      .limit(limit)
      .skip((page - 1) * limit)
      .lean();

    const total = await Message.countDocuments(query);

    // Mark messages as read if viewing conversation
    if (conversationWith) {
      await Message.updateMany(
        {
          sender: conversationWith,
          receiver: session.user.id,
          isRead: false
        },
        { isRead: true, readAt: new Date() }
      );

      // Broadcast socket update for staff unread counts
      try {
        const { broadcastStaffUnreadCounts } = await import('@/lib/realtime/broadcast-counts');
        const messageCount = await Message.countDocuments({
          receiver: session.user.id,
          isRead: false
        });
        broadcastStaffUnreadCounts(session.user.id, { messages: messageCount });
      } catch (error) {
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
      .lean();

    if (!recipientUser) {
      return NextResponse.json({ error: 'Recipient not found' }, { status: 404 });
    }

    const recipientRole = String((recipientUser as any).role || '').toLowerCase();

    // Validate based on sender role
    if (sessionRole === 'dietitian') {
      // Dietitian can message their assigned clients OR other staff
      if (recipientRole === 'client') {
        const isAssigned =
          (recipientUser as any).assignedDietitian?.toString() === session.user.id ||
          (recipientUser as any).assignedDietitians?.some((d: any) => d.toString() === session.user.id);
        if (!isAssigned) {
          return NextResponse.json({ error: 'You can only message clients assigned to you' }, { status: 403 });
        }
      }
    } else if (sessionRole === 'health_counselor') {
      // Health Counselor can message their assigned clients OR other staff
      if (recipientRole === 'client') {
        if ((recipientUser as any).assignedHealthCounselor?.toString() !== session.user.id) {
          return NextResponse.json({ error: 'You can only message clients assigned to you' }, { status: 403 });
        }
      }
    } else if (sessionRole === 'client') {
      // Client can ONLY message their PRIMARY assigned dietitian
      const currentUser = await User.findById(session.user.id)
        .select('assignedDietitian')
        .lean();

      const primaryDietitian = (currentUser as any)?.assignedDietitian?.toString();

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

    // Send real-time notification to BOTH sender and recipient
    const msgJson = message.toJSON();
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

    // Send push notification to recipient
    const senderName = `${(message.sender as any).firstName} ${(message.sender as any).lastName}`;
    try {
      await sendNewMessageNotification(
        validatedData.recipientId,
        senderName,
        validatedData.content,
        message._id.toString()
      );
    } catch (notifError) {
      console.error('Failed to send push notification:', notifError);
      // Don't fail the message send if notification fails
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

    return NextResponse.json(message, { status: 201 });

  } catch (error) {
    console.error('Error sending message:', error);
    return NextResponse.json(
      { error: 'Failed to send message' },
      { status: 500 }
    );
  }
}
