import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import { withCache } from '@/lib/api/utils';
import User from '@/lib/db/models/User';

type LogoutNotificationUserState = {
  status?: string;
  isActive?: boolean;
} | null;

/**
 * Logout notification endpoint.
 * 
 * Two modes:
 * 1. ?check=1 → Simple JSON poll: returns account status (used by useLogoutNotification hook)
 * 2. No query param → SSE stream for real-time updates (legacy, kept for backward compat)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const isPolling = searchParams.get('check') === '1';

    const sessionPromise = getServerSession(authOptions);
    const dbPromise = isPolling ? connectDB() : Promise.resolve(null);
    const session = await sessionPromise;
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // --- Polling mode: return JSON with account status ---
    if (isPolling) {
      await dbPromise;
      const user = await withCache(
        `logout-notification:${session.user.id}`,
        async () => User.findById(session.user.id)
          .select('status isActive')
          .lean(),
        { ttl: 30000, tags: ['users'] }
      ) as LogoutNotificationUserState;

      if (!user) {
        return NextResponse.json({ type: 'ok' });
      }

      // Check if account is deactivated or suspended
      const accountStatus = user.status?.toLowerCase() || 'active';

      if (accountStatus === 'suspended') {
        return NextResponse.json({ type: 'suspended' });
      }

      return NextResponse.json({ type: 'ok' });
    }

    // No SSE mode needed — only polling is used by the client hook
    return NextResponse.json({ type: 'ok' });
  } catch (error) {
    console.error('Error in logout notification:', error);
    return NextResponse.json(
      { error: 'Failed to establish connection' },
      { status: 500 }
    );
  }
}
