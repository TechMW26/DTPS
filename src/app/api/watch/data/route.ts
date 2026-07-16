// API Route: Watch Health Data - Optimized for fast response
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import connectDB from '@/lib/db/connection';
import { WatchService } from '@/watchconnectivity/backend/services/WatchService';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

// GET /api/watch/data - Get watch health data (optimized)
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
    
    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get('date');
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');
    const forceSync = searchParams.get('sync') === 'true';
    
    // Range query
    if (startDateParam && endDateParam) {
      const watchHealthData = await WatchService.getWatchHealthDataRange(
        session.user.id,
        new Date(startDateParam),
        new Date(endDateParam)
      );
      
      return NextResponse.json({
        success: true,
        watchHealthData,
        watchDataCount: watchHealthData.length,
      });
    }
    
    // Single date query - optimized for fast response
    const targetDate = dateParam ? new Date(dateParam) : new Date();
    
    // If force sync requested, sync first then return data
    if (forceSync) {
      const syncResult = await WatchService.syncWatchData(session.user.id);
      if (syncResult.success && syncResult.data) {
        return NextResponse.json({
          success: true,
          watchHealthData: syncResult.data,
          synced: true,
        });
      }
    }
    
    // Get cached data first (fast)
    const watchHealthData = await WatchService.getWatchHealthData(session.user.id, targetDate);
    
    if (watchHealthData) {
      return NextResponse.json({
        success: true,
        watchHealthData,
        cached: true,
      });
    }
    
    // No data found - return empty response with hint to sync
    return NextResponse.json({
      success: true,
      watchHealthData: null,
      message: 'No watch data for this date. Use ?sync=true to fetch fresh data.',
      hint: 'Call POST /api/watch/sync to sync data from your watch',
    });
  } catch (error) {
    console.error('Watch data fetch error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch watch data' },
      { status: 500 }
    );
  }
}

// POST /api/watch/data - Save watch health data (from native apps)
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
    
    const watchData = await req.json();
    
    // Validate required fields
    if (!watchData) {
      return NextResponse.json(
        { success: false, error: 'Watch data is required' },
        { status: 400 }
      );
    }
    
    const savedWatchData = await WatchService.saveWatchHealthData(
      session.user.id,
      watchData
    );
    
    return NextResponse.json({
      success: true,
      message: 'Watch data saved successfully',
      watchHealthData: savedWatchData,
    });
  } catch (error) {
    console.error('Watch data save error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to save watch data' },
      { status: 500 }
    );
  }
}
