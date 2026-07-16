import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import connectDB from '@/lib/db/connection';
import Message from '@/lib/db/models/Message';
import { withCache } from '@/lib/api/utils';

/**
 * GET /api/client/messages/unread-count
 * Returns the total count of unread messages for the current user
 */
export async function GET(request: NextRequest) {
  try {
    // Run auth + DB connection in PARALLEL
    const [session] = await Promise.all([
      getServerSession(authOptions),
      connectDB()
    ]);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Cache unread count for 10 seconds
    const count = await withCache(
      `message-unread:${session.user.id}`,
      () => Message.countDocuments({
        receiver: session.user.id,
        isRead: false
      }),
      { ttl: 10000, tags: ['messages'] }
    );

    return NextResponse.json({ count });
  } catch (error) {
    console.error('Error fetching unread messages count:', error);
    return NextResponse.json(
      { error: 'Failed to fetch unread count' },
      { status: 500 }
    );
  }
}
