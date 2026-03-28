import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import Message from '@/lib/db/models/Message';
import { Notification } from '@/lib/db/models';
import { broadcastUnreadCounts } from '@/lib/realtime/broadcast-counts';

/**
 * POST /api/client/unread-counts/refresh
 * Triggers a refresh of unread counts and broadcasts to all SSE connections
 * Call this after marking notifications/messages as read
 */
export async function POST(request: NextRequest) {
  try {
    // Run auth + DB connection in PARALLEL
    const [session] = await Promise.all([
      getServerSession(authOptions),
      connectDB()
    ]);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    // Get fresh counts
    const [notificationCount, messageCount] = await Promise.all([
      Notification.countDocuments({ userId, read: false }),
      Message.countDocuments({ receiver: userId, isRead: false })
    ]);

    // Broadcast to all SSE connections for this user
    broadcastUnreadCounts(userId, {
      notifications: notificationCount,
      messages: messageCount
    });

    return NextResponse.json({
      success: true,
      notifications: notificationCount,
      messages: messageCount
    });
  } catch (error) {
    console.error('Error refreshing unread counts:', error);
    return NextResponse.json(
      { error: 'Failed to refresh counts' },
      { status: 500 }
    );
  }
}
