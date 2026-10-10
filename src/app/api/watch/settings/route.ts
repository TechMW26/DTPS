import {nativeResponseJson} from '@/lib/api/native-response';
// API Route: Watch Settings
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {getNativeDatabase} from '@/lib/db/database';
import {nativeWatchConnection} from '@/lib/db/repository/native-admin-watch';
import { WatchService } from '@/watchconnectivity/backend/services/WatchService';




// GET /api/watch/settings - Get watch settings
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return nativeResponseJson(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }



    const watchConnection = await WatchService.getWatchConnection(session.user.id);

    if (!watchConnection) {
      return nativeResponseJson({
        success: true,
        watchSettings: null,
        message: 'No watch connected',
      });
    }

    return nativeResponseJson({
      success: true,
      watchSettings: {
        watchSyncEnabled: watchConnection.watchSyncEnabled,
        watchSyncPreferences: watchConnection.watchSyncPreferences,
        watchAutoSyncInterval: watchConnection.watchAutoSyncInterval,
      },
    });
  } catch (error) {
    console.error('Watch settings fetch error:', error);
    return nativeResponseJson(
      { success: false, error: 'Failed to fetch watch settings' },
      { status: 500 }
    );
  }
}

// PUT /api/watch/settings - Update watch settings
export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return nativeResponseJson(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }



    const body = await req.json();
    const { watchSyncEnabled, watchSyncPreferences, watchAutoSyncInterval } = body;

    const updateData: any = {};

    if (typeof watchSyncEnabled === 'boolean') {
      updateData.watchSyncEnabled = watchSyncEnabled;
    }

    if (watchSyncPreferences) {
      updateData.watchSyncPreferences = watchSyncPreferences;
    }

    if (typeof watchAutoSyncInterval === 'number') {
      updateData.watchAutoSyncInterval = Math.max(5, Math.min(watchAutoSyncInterval, 1440)); // 5 min to 24 hours
    }

    const updatedWatchConnection=await nativeWatchConnection(getNativeDatabase(),session.user.id,updateData);

    if (!updatedWatchConnection) {
      return nativeResponseJson(
        { success: false, error: 'No watch connection found' },
        { status: 404 }
      );
    }

    return nativeResponseJson({
      success: true,
      message: 'Watch settings updated successfully',
      watchSettings: {
        watchSyncEnabled: updatedWatchConnection.watchSyncEnabled,
        watchSyncPreferences: updatedWatchConnection.watchSyncPreferences,
        watchAutoSyncInterval: updatedWatchConnection.watchAutoSyncInterval,
      },
    });
  } catch (error) {
    console.error('Watch settings update error:', error);
    return nativeResponseJson(
      { success: false, error: 'Failed to update watch settings' },
      { status: 500 }
    );
  }
}
