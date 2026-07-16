import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import { User } from '@/lib/db/models';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    // Get user's fitness data
    const user = await withCache(
      `fitness:${JSON.stringify(session.user.id)}`,
      async () => await User.findById(session.user.id).select('fitnessData'),
      { ttl: 120000, tags: ['fitness'] }
    );
    
    return NextResponse.json({
      fitnessData: user?.fitnessData || null
    });
  } catch (error) {
    console.error('Error fetching fitness data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch fitness data' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { steps, calories, distance, heartRate, activeMinutes, deviceType } = body;

    // Validate required fields
    if (typeof steps !== 'number' || typeof calories !== 'number') {
      return NextResponse.json(
        { error: 'Steps and calories are required' },
        { status: 400 }
      );
    }

    await connectDB();

    // Update user's fitness data
    const fitnessData = {
      steps,
      calories,
      distance: distance || 0,
      heartRate: heartRate || null,
      activeMinutes: activeMinutes || 0,
      deviceType: deviceType || 'unknown',
      lastSync: new Date(),
      date: new Date().toISOString().split('T')[0] // Store date as YYYY-MM-DD
    };

    const user = await User.findByIdAndUpdate(
      session.user.id,
      {
        $push: {
          'fitnessData.dailyRecords': fitnessData
        },
        $set: {
          'fitnessData.lastSync': new Date(),
          'fitnessData.connectedDevice': deviceType
        }
      },
      { new: true, upsert: true }
    );

    return NextResponse.json({
      success: true,
      fitnessData: fitnessData
    });
  } catch (error) {
    console.error('Error saving fitness data:', error);
    return NextResponse.json(
      { error: 'Failed to save fitness data' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { goals, preferences } = body;

    await connectDB();

    // Update user's fitness goals and preferences
    const updateData: any = {};
    
    if (goals) {
      updateData['fitnessData.goals'] = goals;
    }
    
    if (preferences) {
      updateData['fitnessData.preferences'] = preferences;
    }

    const user = await User.findByIdAndUpdate(
      session.user.id,
      { $set: updateData },
      { new: true }
    );

    return NextResponse.json({
      success: true,
      goals: user?.fitnessData?.goals,
      preferences: user?.fitnessData?.preferences
    });
  } catch (error) {
    console.error('Error updating fitness settings:', error);
    return NextResponse.json(
      { error: 'Failed to update fitness settings' },
      { status: 500 }
    );
  }
}
