import {nativeResponseJson} from '@/lib/api/native-response';
// API Route: Sync Watch Data
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {nativeWatchConnection} from '@/lib/db/repository/native-admin-watch';
import { WatchService } from '@/watchconnectivity/backend/services/WatchService';

// POST /api/watch/sync - Sync watch data
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return nativeResponseJson(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }



    const watchSyncResult = await WatchService.syncWatchData(session.user.id);

    if (!watchSyncResult.success) {
      return nativeResponseJson(
        { success: false, error: watchSyncResult.error },
        { status: 400 }
      );
    }

    return nativeResponseJson({
      success: true,
      message: 'Watch data synced successfully',
      watchData: watchSyncResult.data,
    });
  } catch (error) {
    console.error('Watch sync error:', error);
    return nativeResponseJson(
      { success: false, error: 'Failed to sync watch data' },
      { status: 500 }
    );
  }
}
