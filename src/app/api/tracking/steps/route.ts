import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import DailyTracking from '@/lib/db/models/DailyTracking';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

// GET /api/tracking/steps - Get today's steps
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
      steps: tracking.steps
    });

  } catch (error) {
    console.error('Error fetching steps tracking:', error);
    return NextResponse.json(
      { error: 'Failed to fetch steps tracking' },
      { status: 500 }
    );
  }
}

// POST /api/tracking/steps - Update steps
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { steps } = await request.json();

    if (typeof steps !== 'number' || steps < 0) {
      return NextResponse.json({ error: 'Invalid steps value' }, { status: 400 });
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

    // Update steps
    tracking.steps.count = Math.max(0, Math.min(100000, steps));

    await tracking.save();

    return NextResponse.json({
      success: true,
      steps: tracking.steps
    });

  } catch (error) {
    console.error('Error updating steps tracking:', error);
    return NextResponse.json(
      { error: 'Failed to update steps tracking' },
      { status: 500 }
    );
  }
}

