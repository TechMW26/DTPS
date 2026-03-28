import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import connectDB from '@/lib/db/connection';
import Message from '@/lib/db/models/Message';
import User from '@/lib/db/models/User';
import { Notification } from '@/lib/db/models';
import mongoose from 'mongoose';
import { broadcastUnreadCounts } from '@/lib/realtime/broadcast-counts';
import { socketManager } from '@/lib/realtime/socket-manager';
import { sendNewMessageNotification } from '@/lib/notifications/notificationService';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

// GET /api/client/messages - Get messages for current client
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const conversationWith = searchParams.get('conversationWith');
    const limit = parseInt(searchParams.get('limit') || '50');
    const page = parseInt(searchParams.get('page') || '1');

    // Validate client can only chat with their primary dietitian
    if (conversationWith) {
      const currentUser = await User.findById(session.user.id)
        .select('assignedDietitian')
        .lean();

      const primaryDietitian = (currentUser as any)?.assignedDietitian?.toString();

      if (!primaryDietitian || primaryDietitian !== conversationWith) {
        return NextResponse.json({ error: 'You can only message your primary dietitian' }, { status: 403 });
      }
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
      .populate('sender', 'firstName lastName avatar role')
      .populate('receiver', 'firstName lastName avatar role')
      .sort({ createdAt: 1 })
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

      // Broadcast socket update for unread counts
      const [notificationCount, messageCount] = await Promise.all([
        Notification.countDocuments({ userId: session.user.id, read: false }),
        Message.countDocuments({ receiver: session.user.id, isRead: false })
      ]);

      broadcastUnreadCounts(session.user.id, {
        notifications: notificationCount,
        messages: messageCount
      });
    }

    return NextResponse.json({
      messages,
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

// POST /api/client/messages - Send a message
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const data = await request.json();
    const { recipientId, content, type = 'text', attachments } = data;

    if (!recipientId || !content) {
      return NextResponse.json(
        { error: 'Recipient ID and content are required' },
        { status: 400 }
      );
    }

    // Validate client can only message their primary dietitian
    const currentUser = await User.findById(session.user.id)
      .select('assignedDietitian')
      .lean();

    const primaryDietitian = (currentUser as any)?.assignedDietitian?.toString();

    if (!primaryDietitian || primaryDietitian !== recipientId) {
      return NextResponse.json({ error: 'You can only message your primary dietitian' }, { status: 403 });
    }

    // Verify recipient exists
    const recipient = await withCache(
      `client:messages:${JSON.stringify(recipientId)}`,
      async () => await User.findById(recipientId).select('firstName lastName role'),
      { ttl: 30000, tags: ['client'] }
    );
    if (!recipient) {
      return NextResponse.json(
        { error: 'Recipient not found' },
        { status: 404 }
      );
    }

    // Create the message
    const message = new Message({
      sender: session.user.id,
      receiver: recipientId,
      content,
      type,
      attachments: attachments || [],
      status: 'sent',
      isRead: false
    });

    await message.save();

    // Populate sender and receiver info
    await message.populate('sender', 'firstName lastName avatar role');
    await message.populate('receiver', 'firstName lastName avatar role');

    // Send real-time notification to BOTH sender and recipient via Socket.io
    const msgJson = message.toJSON();
    const ts = Date.now();

    // Send to recipient — from their perspective the conversation is with the sender
    socketManager.sendToUser(recipientId, 'new_message', {
      message: msgJson,
      conversationWith: session.user.id,
      timestamp: ts
    });

    // Send to sender — from their perspective the conversation is with the recipient
    socketManager.sendToUser(session.user.id, 'new_message', {
      message: msgJson,
      conversationWith: recipientId,
      timestamp: ts
    });

    // Send push notification to recipient (dietitian/health counselor)
    const sender = await withCache(
      `client:messages:${JSON.stringify(session.user.id)}`,
      async () => await User.findById(session.user.id).select('firstName lastName'),
      { ttl: 30000, tags: ['client'] }
    );
    const senderName = sender ? `${sender.firstName} ${sender.lastName}` : 'A user';
    try {
      await sendNewMessageNotification(
        recipientId,
        senderName,
        content,
        message._id.toString()
      );
    } catch (notifError) {
      console.error('Failed to send push notification:', notifError);
    }

    // Broadcast socket update for recipient's unread counts
    const recipientMessageCount = await Message.countDocuments({ receiver: recipientId, isRead: false });
    const recipientNotificationCount = await Notification.countDocuments({ userId: recipientId, read: false });
    broadcastUnreadCounts(recipientId, {
      notifications: recipientNotificationCount,
      messages: recipientMessageCount
    });

    return NextResponse.json({
      success: true,
      message
    });

  } catch (error) {
    console.error('Error sending message:', error);
    return NextResponse.json(
      { error: 'Failed to send message' },
      { status: 500 }
    );
  }
}

// Helper function to get conversations list (not exported as route handler)
export async function getConversations(userId: string) {
  const conversations = await withCache(
    `client:messages:${JSON.stringify([
      {
        $match: {
          $or: [
            { sender: new mongoose.Types.ObjectId(userId) },
            { receiver: new mongoose.Types.ObjectId(userId) }
          ]
        }
      },
      {
        $sort: { createdAt: -1 }
      },
      {
        $group: {
          _id: {
            $cond: [
              { $eq: ['$sender', new mongoose.Types.ObjectId(userId)] },
              '$receiver',
              '$sender'
            ]
          },
          lastMessage: { $first: '$$ROOT' },
          unreadCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$receiver', new mongoose.Types.ObjectId(userId)] },
                    { $eq: ['$isRead', false] }
                  ]
                },
                1,
                0
              ]
            }
          }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      {
        $unwind: '$user'
      },
      {
        $project: {
          _id: 1,
          user: {
            _id: '$user._id',
            firstName: '$user.firstName',
            lastName: '$user.lastName',
            avatar: '$user.avatar',
            role: '$user.role'
          },
          lastMessage: {
            content: '$lastMessage.content',
            type: '$lastMessage.type',
            createdAt: '$lastMessage.createdAt',
            isRead: '$lastMessage.isRead'
          },
          unreadCount: 1
        }
      },
      {
        $sort: { 'lastMessage.createdAt': -1 }
      }
    ])}`,
    async () => await Message.aggregate([
      {
        $match: {
          $or: [
            { sender: new mongoose.Types.ObjectId(userId) },
            { receiver: new mongoose.Types.ObjectId(userId) }
          ]
        }
      },
      {
        $sort: { createdAt: -1 }
      },
      {
        $group: {
          _id: {
            $cond: [
              { $eq: ['$sender', new mongoose.Types.ObjectId(userId)] },
              '$receiver',
              '$sender'
            ]
          },
          lastMessage: { $first: '$$ROOT' },
          unreadCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$receiver', new mongoose.Types.ObjectId(userId)] },
                    { $eq: ['$isRead', false] }
                  ]
                },
                1,
                0
              ]
            }
          }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      {
        $unwind: '$user'
      },
      {
        $project: {
          _id: 1,
          user: {
            _id: '$user._id',
            firstName: '$user.firstName',
            lastName: '$user.lastName',
            avatar: '$user.avatar',
            role: '$user.role'
          },
          lastMessage: {
            content: '$lastMessage.content',
            type: '$lastMessage.type',
            createdAt: '$lastMessage.createdAt',
            isRead: '$lastMessage.isRead'
          },
          unreadCount: 1
        }
      },
      {
        $sort: { 'lastMessage.createdAt': -1 }
      }
    ]),
    { ttl: 30000, tags: ['client'] }
  );

  return conversations;
}
