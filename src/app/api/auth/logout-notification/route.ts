import {nativeResponseJson} from '@/lib/api/native-response';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/database';
import {nativeSessionStatus} from '@/lib/db/repository/native-auth';
import { withCache } from '@/lib/cache/memoryCache';

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
    const session = await sessionPromise;
    if (!session?.user?.id) {
      return nativeResponseJson({ error: 'Unauthorized' }, { status: 401 });
    }

    // --- Polling mode: return JSON with account status ---
    if (isPolling) {
      const user = await withCache(
        `logout-notification:${session.user.id}`,
        async () => nativeSessionStatus(getNativeDatabase(),session.user.id,!!session.user.isWooCommerceClient),
        { ttl: 30000, tags: ['users'] }
      ) as LogoutNotificationUserState;

      if (!user) {
        return nativeResponseJson({ type: 'suspended' });
      }

      // Check if account is deactivated or suspended
      const accountStatus = user.status?.toLowerCase() || 'active';

      if (accountStatus !== 'active') {
        return nativeResponseJson({ type: 'suspended' });
      }

      return nativeResponseJson({ type: 'ok' });
    }

    // No SSE mode needed — only polling is used by the client hook
    return nativeResponseJson({ type: 'ok' });
  } catch (error) {
    console.error('Error in logout notification:', error);
    return nativeResponseJson(
      { error: 'Failed to establish connection' },
      { status: 500 }
    );
  }
}
