// API Route: Sync Watch Data
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import connectDB from '@/lib/db/connection';
import { WatchService } from '@/watchconnectivity/backend/services/WatchService';

// POST /api/watch/sync - Sync watch data
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    await connectDB();
    
    const watchSyncResult = await WatchService.syncWatchData(session.user.id);
    
    if (!watchSyncResult.success) {
      return NextResponse.json(
        { success: false, error: watchSyncResult.error },
        { status: 400 }
      );
    }
    
    return NextResponse.json({
      success: true,
      message: 'Watch data synced successfully',
      watchData: watchSyncResult.data,
    });
  } catch (error) {
    console.error('Watch sync error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to sync watch data' },
      { status: 500 }
    );
  }
}
