import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import DailyTracking from '@/lib/db/models/DailyTracking';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const { hours } = await request.json();

    if (typeof hours !== 'number' || hours < 0 || hours > 24) {
      return NextResponse.json({ error: 'Invalid sleep hours' }, { status: 400 });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Find or create today's tracking record
    let tracking = await DailyTracking.findOne({
      client: session.user.id,
      date: today
    });

    if (!tracking) {
      tracking = new DailyTracking({
        client: session.user.id,
        date: today,
        water: { glasses: 0, target: 8 },
        steps: { count: 0, target: 10000 },
        sleep: { hours: hours, target: 8 }
      });
    } else {
      if (!tracking.sleep) {
        tracking.sleep = { hours: hours, target: 8 };
      } else {
        tracking.sleep.hours = hours;
      }
    }

    await tracking.save();

    return NextResponse.json({
      success: true,
      sleep: {
        hours: tracking.sleep.hours,
        target: tracking.sleep.target
      }
    });

  } catch (error) {
    console.error('Error updating sleep:', error);
    return NextResponse.json(
      { error: 'Failed to update sleep' },
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

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tracking = await withCache(
      `tracking:sleep:${JSON.stringify({
      client: session.user.id,
      date: today
    })}`,
      async () => await DailyTracking.findOne({
      client: session.user.id,
      date: today
    }),
      { ttl: 120000, tags: ['tracking'] }
    );

    return NextResponse.json({
      sleep: {
        hours: tracking?.sleep?.hours || 0,
        target: tracking?.sleep?.target || 8
      }
    });

  } catch (error) {
    console.error('Error fetching sleep:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sleep data' },
      { status: 500 }
    );
  }
}
