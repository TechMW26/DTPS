import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import User from '@/lib/db/models/User';
import { UserRole } from '@/types';
import { z } from 'zod';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

// Availability validation schema
const availabilitySchema = z.object({
  schedule: z.array(z.object({
    dayOfWeek: z.number().min(0).max(6), // 0 = Sunday, 6 = Saturday
    timeSlots: z.array(z.object({
      startTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:MM)'),
      endTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:MM)'),
      isAvailable: z.boolean().default(true)
    }))
  })),
  timezone: z.string().min(1, 'Timezone is required'),
  consultationDuration: z.number().min(15).max(180).default(60), // minutes
  bufferTime: z.number().min(0).max(60).default(15), // minutes between appointments
  maxAdvanceBooking: z.number().min(1).max(365).default(30), // days
  minAdvanceBooking: z.number().min(0).max(7).default(1) // days
});

// GET /api/users/dietitian/availability - Get dietitian's availability
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const dietitianId = searchParams.get('dietitianId') || session.user.id;

    // Only allow dietitians to view their own availability, or anyone to view others'
    if (dietitianId !== session.user.id && session.user.role === UserRole.CLIENT) {
      // Clients can view any dietitian's availability for booking
    } else if (dietitianId !== session.user.id && session.user.role !== UserRole.ADMIN) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await connectDB();

    const dietitian = await withCache(
      `users:dietitian:availability:${JSON.stringify(dietitianId)}`,
      async () => await User.findById(dietitianId).select('availability schedule'),
      { ttl: 120000, tags: ['users'] }
    );

    if (!dietitian || (dietitian.role !== UserRole.DIETITIAN && dietitian.role !== UserRole.HEALTH_COUNSELOR)) {
      return NextResponse.json({ error: 'Dietitian/Health Counselor not found' }, { status: 404 });
    }

    const { searchParams: urlParams } = new URL(request.url);
    const format = urlParams.get('format');

    // The availability is stored as simple array: [{day, startTime, endTime}]
    const availability = dietitian.availability || [];

    // Return simple format if requested (same as stored format)
    if (format === 'simple') {
      return NextResponse.json({
        availability: availability
      });
    }

    return NextResponse.json({
      availability
    });

  } catch (error) {
    console.error('Error fetching availability:', error);
    return NextResponse.json(
      { error: 'Failed to fetch availability' },
      { status: 500 }
    );
  }
}

// POST /api/users/dietitian/availability - Set dietitian's availability
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only dietitians and health counselors can set their own availability
    if (session.user.role !== UserRole.DIETITIAN && session.user.role !== UserRole.HEALTH_COUNSELOR) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    
    // Validate input
    const validatedData = availabilitySchema.parse(body);

    await connectDB();

    // Validate time slots don't overlap
    for (const day of validatedData.schedule) {
      const sortedSlots = day.timeSlots.sort((a, b) => a.startTime.localeCompare(b.startTime));
      
      for (let i = 0; i < sortedSlots.length - 1; i++) {
        const current = sortedSlots[i];
        const next = sortedSlots[i + 1];
        
        if (current.endTime > next.startTime) {
          return NextResponse.json(
            { error: `Overlapping time slots on day ${day.dayOfWeek}` },
            { status: 400 }
          );
        }
      }
    }

    // Update dietitian's availability
    const dietitian = await User.findByIdAndUpdate(
      session.user.id,
      { 
        $set: { 
          availability: validatedData,
          updatedAt: new Date()
        }
      },
      { new: true }
    ).select('availability');

    return NextResponse.json({
      message: 'Availability updated successfully',
      availability: dietitian?.availability
    });

  } catch (error) {
    console.error('Error updating availability:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          error: 'Validation error',
          details: error.issues
        },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to update availability' },
      { status: 500 }
    );
  }
}

// PUT /api/users/dietitian/availability - Update specific availability settings or simple availability
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (session.user.role !== UserRole.DIETITIAN && session.user.role !== UserRole.HEALTH_COUNSELOR) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();

    await connectDB();

    // Check if this is a simple availability update (from our new UI)
    if (body.availability && Array.isArray(body.availability)) {
      // Validate and format simple availability
      const simpleAvailability = body.availability.map((slot: any) => ({
        day: slot.day.toLowerCase(),
        startTime: slot.startTime,
        endTime: slot.endTime
      }));

      // Update with simple format (matches User model schema)
      const dietitian = await User.findByIdAndUpdate(
        session.user.id,
        {
          $set: {
            availability: simpleAvailability,
            updatedAt: new Date()
          }
        },
        { new: true }
      ).select('availability');


      return NextResponse.json({
        message: 'Availability updated successfully',
        availability: dietitian?.availability
      });
    }

    // Handle complex availability updates (existing functionality)
    const updates: any = {};

    if (body.timezone) updates['availability.timezone'] = body.timezone;
    if (body.consultationDuration) updates['availability.consultationDuration'] = body.consultationDuration;
    if (body.bufferTime) updates['availability.bufferTime'] = body.bufferTime;
    if (body.maxAdvanceBooking) updates['availability.maxAdvanceBooking'] = body.maxAdvanceBooking;
    if (body.minAdvanceBooking) updates['availability.minAdvanceBooking'] = body.minAdvanceBooking;

    const dietitian = await User.findByIdAndUpdate(
      session.user.id,
      {
        $set: {
          ...updates,
          updatedAt: new Date()
        }
      },
      { new: true }
    ).select('availability');

    return NextResponse.json({
      message: 'Availability settings updated successfully',
      availability: dietitian?.availability
    });

  } catch (error) {
    console.error('Error updating availability settings:', error);
    return NextResponse.json(
      { error: 'Failed to update availability settings' },
      { status: 500 }
    );
  }
}
