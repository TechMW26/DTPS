// API Route: Connect Watch
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import connectDB from '@/lib/db/connection';
import { WatchService } from '@/watchconnectivity/backend/services/WatchService';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

// POST /api/watch/connect - Connect a watch
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
    
    const body = await req.json();
    const { watchProvider, watchDeviceName, watchDeviceModel, watchTokens } = body;
    
    if (!watchProvider) {
      return NextResponse.json(
        { success: false, error: 'Watch provider is required' },
        { status: 400 }
      );
    }
    
    const validProviders = ['apple_watch', 'google_fit', 'fitbit', 'samsung', 'garmin', 'noisefit', 'other'];
    if (!validProviders.includes(watchProvider)) {
      return NextResponse.json(
        { success: false, error: 'Invalid watch provider' },
        { status: 400 }
      );
    }
    
    const watchConnection = await WatchService.connectWatch(
      session.user.id,
      watchProvider,
      watchTokens
    );
    
    // Update device details if provided
    if (watchDeviceName || watchDeviceModel) {
      watchConnection.watchDeviceName = watchDeviceName;
      watchConnection.watchDeviceModel = watchDeviceModel;
      await watchConnection.save();
    }
    
    return NextResponse.json({
      success: true,
      message: 'Watch connected successfully',
      watchConnection: {
        watchProvider: watchConnection.watchProvider,
        watchIsConnected: watchConnection.watchIsConnected,
        watchDeviceName: watchConnection.watchDeviceName,
        watchDeviceModel: watchConnection.watchDeviceModel,
        watchLastSync: watchConnection.watchLastSync,
      },
    });
  } catch (error) {
    console.error('Watch connect error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to connect watch' },
      { status: 500 }
    );
  }
}

// GET /api/watch/connect - Get watch connection status
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
        watchConnected: false,
        watchConnection: null,
      });
    }
    
    return NextResponse.json({
      success: true,
      watchConnected: watchConnection.watchIsConnected,
      watchConnection: {
        watchProvider: watchConnection.watchProvider,
        watchIsConnected: watchConnection.watchIsConnected,
        watchDeviceName: watchConnection.watchDeviceName,
        watchDeviceModel: watchConnection.watchDeviceModel,
        watchLastSync: watchConnection.watchLastSync,
        watchSyncPreferences: watchConnection.watchSyncPreferences,
        watchAutoSyncInterval: watchConnection.watchAutoSyncInterval,
      },
    });
  } catch (error) {
    console.error('Watch status error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get watch status' },
      { status: 500 }
    );
  }
}

// DELETE /api/watch/connect - Disconnect watch
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    await connectDB();
    
    const result = await WatchService.disconnectWatch(session.user.id);
    
    if (!result) {
      return NextResponse.json(
        { success: false, error: 'No watch connection found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      success: true,
      message: 'Watch disconnected successfully',
    });
  } catch (error) {
    console.error('Watch disconnect error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to disconnect watch' },
      { status: 500 }
    );
  }
}
