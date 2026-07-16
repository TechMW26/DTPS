import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import User from '@/lib/db/models/User';
import ProgressEntry from '@/lib/db/models/ProgressEntry';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const { weight } = await request.json();

    if (typeof weight !== 'number' || weight <= 0 || weight > 1000) {
      return NextResponse.json({ error: 'Invalid weight value' }, { status: 400 });
    }

    // Get user to find assigned dietitian
    const user = await withCache(
      `tracking:weight:${JSON.stringify(session.user.id)}`,
      async () => await User.findById(session.user.id),
      { ttl: 120000, tags: ['tracking'] }
    );
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Create a new progress entry for weight tracking
    const progressEntry = new ProgressEntry({
      user: session.user.id,
      type: 'weight',
      value: weight,
      unit: 'kg',
      notes: 'Weight logged via dashboard',
      recordedAt: new Date()
    });

    await progressEntry.save();

    // Update user's current weight
    const updatedUser = await User.findByIdAndUpdate(
      session.user.id,
      {
        weight: weight,
        'goals.currentWeight': weight,
        updatedAt: new Date()
      },
      { new: true }
    );

    // Get recent weight entries for trend
    const recentEntries = await withCache(
      `tracking:weight:${JSON.stringify({
      user: session.user.id,
      type: 'weight'
    })}`,
      async () => await ProgressEntry.find({
      user: session.user.id,
      type: 'weight'
    })
    .sort({ recordedAt: -1 })
    .limit(7)
    .select('value recordedAt'),
      { ttl: 120000, tags: ['tracking'] }
    );

    return NextResponse.json({
      success: true,
      weight: {
        current: updatedUser?.weight || weight,
        target: updatedUser?.goals?.targetWeight || 70,
        history: recentEntries
      }
    });

  } catch (error) {
    console.error('Error updating weight:', error);
    return NextResponse.json(
      { error: 'Failed to update weight' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const user = await withCache(
      `tracking:weight:${JSON.stringify(session.user.id)}`,
      async () => await User.findById(session.user.id),
      { ttl: 120000, tags: ['tracking'] }
    );

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get recent weight entries for trend
    const recentEntries = await withCache(
      `tracking:weight:${JSON.stringify({
      user: session.user.id,
      type: 'weight'
    })}`,
      async () => await ProgressEntry.find({
      user: session.user.id,
      type: 'weight'
    })
    .sort({ recordedAt: -1 })
    .limit(30)
    .select('value recordedAt'),
      { ttl: 120000, tags: ['tracking'] }
    );

    return NextResponse.json({
      weight: {
        current: user.weight || 0,
        target: user.goals?.targetWeight || 70,
        history: recentEntries
      }
    });

  } catch (error) {
    console.error('Error fetching weight:', error);
    return NextResponse.json(
      { error: 'Failed to fetch weight data' },
      { status: 500 }
    );
  }
}
