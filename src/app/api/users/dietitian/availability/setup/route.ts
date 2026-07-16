import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import User from '@/lib/db/models/User';
import { UserRole } from '@/types';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

// POST /api/users/dietitian/availability/setup - Quick setup with default availability
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (session.user.role !== UserRole.DIETITIAN && session.user.role !== UserRole.HEALTH_COUNSELOR) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await connectDB();

    // Default business hours availability (Monday to Saturday, 10 AM to 6 PM with lunch break)
    // Using 12-hour format for IST
    const defaultAvailability = [
      { day: 'monday', startTime: '10:00 AM', endTime: '1:00 PM' },
      { day: 'monday', startTime: '2:00 PM', endTime: '6:00 PM' },
      { day: 'tuesday', startTime: '10:00 AM', endTime: '1:00 PM' },
      { day: 'tuesday', startTime: '2:00 PM', endTime: '6:00 PM' },
      { day: 'wednesday', startTime: '10:00 AM', endTime: '1:00 PM' },
      { day: 'wednesday', startTime: '2:00 PM', endTime: '6:00 PM' },
      { day: 'thursday', startTime: '10:00 AM', endTime: '1:00 PM' },
      { day: 'thursday', startTime: '2:00 PM', endTime: '6:00 PM' },
      { day: 'friday', startTime: '10:00 AM', endTime: '1:00 PM' },
      { day: 'friday', startTime: '2:00 PM', endTime: '6:00 PM' },
      { day: 'saturday', startTime: '10:00 AM', endTime: '1:00 PM' },
      { day: 'saturday', startTime: '2:00 PM', endTime: '6:00 PM' }
    ];

    // Update dietitian's availability
    const dietitian = await User.findByIdAndUpdate(
      session.user.id,
      { 
        $set: { 
          availability: defaultAvailability,
          updatedAt: new Date()
        }
      },
      { new: true }
    ).select('availability firstName lastName');

    return NextResponse.json({
      message: 'Default availability setup completed successfully',
      availability: dietitian?.availability,
      summary: {
        days: 'Monday to Saturday',
        hours: '10:00 AM - 1:00 PM, 2:00 PM - 6:00 PM',
        duration: '60 minutes per consultation',
        bufferTime: '15 minutes between appointments'
      }
    });

  } catch (error) {
    console.error('Error setting up default availability:', error);
    return NextResponse.json(
      { error: 'Failed to setup default availability' },
      { status: 500 }
    );
  }
}

// GET /api/users/dietitian/availability/setup - Check if setup is needed
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (session.user.role !== UserRole.DIETITIAN && session.user.role !== UserRole.HEALTH_COUNSELOR) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await connectDB();

    const dietitian = await withCache(
      `users:dietitian:availability:setup:${JSON.stringify(session.user.id)}`,
      async () => await User.findById(session.user.id).select('availability'),
      { ttl: 120000, tags: ['users'] }
    );
    
    const hasAvailability = dietitian?.availability?.schedule && 
                           dietitian.availability.schedule.length > 0;

    return NextResponse.json({
      needsSetup: !hasAvailability,
      hasAvailability,
      currentScheduleCount: dietitian?.availability?.schedule?.length || 0
    });

  } catch (error) {
    console.error('Error checking availability setup:', error);
    return NextResponse.json(
      { error: 'Failed to check availability setup' },
      { status: 500 }
    );
  }
}
