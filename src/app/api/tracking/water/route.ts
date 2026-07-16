import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import DailyTracking from '@/lib/db/models/DailyTracking';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

// GET /api/tracking/water - Get today's water intake
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    // Get today's date (start of day)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let tracking = await DailyTracking.findOne({
      client: session.user.id,
      date: today
    });

    // If no tracking for today, create one
    if (!tracking) {
      tracking = await DailyTracking.create({
        client: session.user.id,
        date: today,
        water: { glasses: 0, target: 8 },
        steps: { count: 0, target: 10000 }
      });
    }

    return NextResponse.json({
      success: true,
      water: tracking.water
    });

  } catch (error) {
    console.error('Error fetching water tracking:', error);
    return NextResponse.json(
      { error: 'Failed to fetch water tracking' },
      { status: 500 }
    );
  }
}

// POST /api/tracking/water - Update water intake
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { glasses, action } = await request.json();

    await connectDB();

    // Get today's date (start of day)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let tracking = await DailyTracking.findOne({
      client: session.user.id,
      date: today
    });

    // If no tracking for today, create one
    if (!tracking) {
      tracking = await DailyTracking.create({
        client: session.user.id,
        date: today,
        water: { glasses: 0, target: 8 },
        steps: { count: 0, target: 10000 }
      });
    }

    // Update water based on action
    if (action === 'set') {
      tracking.water.glasses = Math.max(0, Math.min(20, glasses));
    } else if (action === 'increment') {
      tracking.water.glasses = Math.min(20, tracking.water.glasses + 1);
    } else if (action === 'decrement') {
      tracking.water.glasses = Math.max(0, tracking.water.glasses - 1);
    }

    await tracking.save();

    return NextResponse.json({
      success: true,
      water: tracking.water
    });

  } catch (error) {
    console.error('Error updating water tracking:', error);
    return NextResponse.json(
      { error: 'Failed to update water tracking' },
      { status: 500 }
    );
  }
}

