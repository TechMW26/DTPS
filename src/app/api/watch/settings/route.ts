// API Route: Watch Settings
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import connectDB from '@/lib/db/connection';
import { WatchService } from '@/watchconnectivity/backend/services/WatchService';
import WatchConnection from '@/watchconnectivity/backend/models/WatchConnection';
import mongoose from 'mongoose';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

// GET /api/watch/settings - Get watch settings
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    await connectDB();
    
    const watchConnection = await WatchService.getWatchConnection(session.user.id);
    
    if (!watchConnection) {
      return NextResponse.json({
        success: true,
        watchSettings: null,
        message: 'No watch connected',
      });
    }
    
    return NextResponse.json({
      success: true,
      watchSettings: {
        watchSyncEnabled: watchConnection.watchSyncEnabled,
        watchSyncPreferences: watchConnection.watchSyncPreferences,
        watchAutoSyncInterval: watchConnection.watchAutoSyncInterval,
      },
    });
  } catch (error) {
    console.error('Watch settings fetch error:', error);
    return NextResponse.json(
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
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    await connectDB();
    
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
    
    const updatedWatchConnection = await WatchConnection.findOneAndUpdate(
      { userId: new mongoose.Types.ObjectId(session.user.id) },
      updateData,
      { new: true }
    );
    
    if (!updatedWatchConnection) {
      return NextResponse.json(
        { success: false, error: 'No watch connection found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
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
    return NextResponse.json(
      { success: false, error: 'Failed to update watch settings' },
      { status: 500 }
    );
  }
}
