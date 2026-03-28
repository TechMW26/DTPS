import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import connectDB from '@/lib/db/connection';
import Message from '@/lib/db/models/Message';
import { broadcastStaffUnreadCounts } from '@/lib/realtime/broadcast-counts';

/**
 * POST /api/staff/unread-counts/refresh
 * Triggers a refresh of unread message counts for staff and broadcasts to all SSE connections
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    await connectDB();

    // Get fresh message counts
    const messageCount = await Message.countDocuments({
      receiver: userId,
      isRead: false
    });

    // Broadcast to all SSE connections for this user
    broadcastStaffUnreadCounts(userId, {
      messages: messageCount
    });

    return NextResponse.json({
      success: true,
      messages: messageCount
    });
  } catch (error) {
    console.error('Error refreshing staff unread counts:', error);
    return NextResponse.json(
      { error: 'Failed to refresh counts' },
      { status: 500 }
    );
  }
}
