import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import connectDB from '@/lib/db/connection';
import Message from '@/lib/db/models/Message';
import { broadcastStaffUnreadCounts } from '@/lib/realtime/broadcast-counts';

/**
 * POST /api/staff/unread-counts/refresh
 * Triggers a refresh of unread message counts for staff and broadcasts to all SSE connections
 */
export async function POST() {
  try {
    const sessionPromise = getServerSession(authOptions);
    const dbPromise = connectDB();
    const session = await sessionPromise;

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    await dbPromise;

    // Get fresh message counts
    const messageCount = await Message.countDocuments({
      receiver: userId,
      isRead: false
    }).maxTimeMS(3000); // 3s timeout for query

    // Broadcast to all SSE connections for this user
    broadcastStaffUnreadCounts(userId, {
      messages: messageCount
    });

    return NextResponse.json(
      {
        success: true,
        messages: messageCount
      },
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        }
      }
    );
  } catch (error) {
    console.error('Error refreshing staff unread counts:', error);

    // Return 500 but with proper error info for debugging
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to refresh counts',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
