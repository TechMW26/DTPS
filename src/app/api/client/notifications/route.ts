import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import Notification from '@/lib/db/models/Notification';
import Message from '@/lib/db/models/Message';
import { broadcastUnreadCounts } from '@/lib/realtime/broadcast-counts';

// GET /api/client/notifications - Get all notifications for the current user
export async function GET(request: NextRequest) {
  try {
    // Run auth + DB connection in PARALLEL
    const [session] = await Promise.all([
      getServerSession(authOptions),
      connectDB()
    ]);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const type = searchParams.get('type');
    const unreadOnly = searchParams.get('unread') === 'true';

    const skip = (page - 1) * limit;

    // Build query
    const query: Record<string, unknown> = {
      userId: session.user.id
    };

    if (type) {
      query.type = type;
    }

    if (unreadOnly) {
      query.read = false;
    }

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Notification.countDocuments(query),
      Notification.countDocuments({
        userId: session.user.id,
        read: false
      })
    ]);

    return NextResponse.json({
      success: true,
      notifications,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      },
      unreadCount
    });

  } catch (error) {
    console.error('Error fetching notifications:', error);
    return NextResponse.json(
      { error: 'Failed to fetch notifications' },
      { status: 500 }
    );
  }
}

// POST /api/client/notifications/mark-read - Mark notifications as read
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const body = await request.json();
    const { notificationIds, markAll } = body;

    if (markAll) {
      // Mark all notifications as read
      await Notification.updateMany(
        { userId: session.user.id, read: false },
        { read: true }
      );
    } else if (notificationIds && notificationIds.length > 0) {
      // Mark specific notifications as read
      await Notification.updateMany(
        {
          _id: { $in: notificationIds },
          userId: session.user.id
        },
        { read: true }
      );
    }

    const unreadCount = await Notification.countDocuments({
      userId: session.user.id,
      read: false
    });

    // Get message count and broadcast SSE update
    const messageCount = await Message.countDocuments({
      receiver: session.user.id,
      isRead: false
    });

    broadcastUnreadCounts(session.user.id, {
      notifications: unreadCount,
      messages: messageCount
    });

    return NextResponse.json({
      success: true,
      unreadCount
    });

  } catch (error) {
    console.error('Error marking notifications as read:', error);
    return NextResponse.json(
      { error: 'Failed to mark notifications as read' },
      { status: 500 }
    );
  }
}

// DELETE /api/client/notifications - Delete notifications
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const notificationId = searchParams.get('id');
    const deleteAll = searchParams.get('all') === 'true';

    if (deleteAll) {
      await Notification.deleteMany({ userId: session.user.id });
    } else if (notificationId) {
      await Notification.deleteOne({
        _id: notificationId,
        userId: session.user.id
      });
    }

    return NextResponse.json({
      success: true
    });

  } catch (error) {
    console.error('Error deleting notifications:', error);
    return NextResponse.json(
      { error: 'Failed to delete notifications' },
      { status: 500 }
    );
  }
}
