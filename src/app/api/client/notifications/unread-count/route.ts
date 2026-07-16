import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import { Notification } from '@/lib/db/models';
import { withCache } from '@/lib/api/utils';

// GET /api/client/notifications/unread-count - Get count of unread notifications
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

    // Cache unread count for 15 seconds (short TTL since notifications change often)
    const count = await withCache(
      `notification-unread:${session.user.id}`,
      () => Notification.countDocuments({
        userId: session.user.id,
        read: false
      }),
      { ttl: 15000, tags: ['notifications'] }
    );

    return NextResponse.json({
      success: true,
      count
    });

  } catch (error) {
    console.error('Error fetching unread notifications count:', error);
    return NextResponse.json({
      success: true,
      count: 0
    });
  }
}
