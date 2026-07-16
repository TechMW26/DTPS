import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import User from '@/lib/db/models/User';
import { UserRole } from '@/types';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

// GET /api/users/dietitian - Get assigned dietitian for current client
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only clients can access this endpoint
    if (session.user.role !== UserRole.CLIENT) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await connectDB();

    // Get current user to find assigned dietitian
    const currentUser = await withCache(
      `users:dietitian:${JSON.stringify(session.user.id)}`,
      async () => await User.findById(session.user.id),
      { ttl: 120000, tags: ['users'] }
    );
    if (!currentUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (!currentUser.assignedDietitian) {
      return NextResponse.json({ 
        dietitian: null,
        message: 'No dietitian assigned yet' 
      });
    }

    // Get assigned dietitian details
    const dietitian = await withCache(
      `users:dietitian:${JSON.stringify(currentUser.assignedDietitian)}`,
      async () => await User.findById(currentUser.assignedDietitian)
      .select('firstName lastName email phone avatar bio credentials specializations experience consultationFee'),
      { ttl: 120000, tags: ['users'] }
    );

    if (!dietitian) {
      return NextResponse.json({ 
        dietitian: null,
        message: 'Assigned dietitian not found' 
      });
    }

    return NextResponse.json({ dietitian });

  } catch (error) {
    console.error('Error fetching assigned dietitian:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dietitian information' },
      { status: 500 }
    );
  }
}
