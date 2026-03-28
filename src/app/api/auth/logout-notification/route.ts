import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import User from '@/lib/db/models/User';

/**
 * Logout notification endpoint.
 * 
 * Two modes:
 * 1. ?check=1 → Simple JSON poll: returns account status (used by useLogoutNotification hook)
 * 2. No query param → SSE stream for real-time updates (legacy, kept for backward compat)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const isPolling = searchParams.get('check') === '1';

    // --- Polling mode: return JSON with account status ---
    if (isPolling) {
      await connectDB();
      const user = await User.findById(session.user.id)
        .select('status isActive')
        .lean() as any;

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
