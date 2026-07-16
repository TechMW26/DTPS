import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import { ProviderAvailability } from '@/lib/db/models/AppointmentConfig';
import Appointment from '@/lib/db/models/Appointment';
import User from '@/lib/db/models/User';
import { UserRole } from '@/types';
import { z } from 'zod';
import mongoose from 'mongoose';

// Validation schema for availability slot
const availabilitySchema = z.object({
  dayOfWeek: z.number().min(0).max(6),
  startTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
  endTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
  slotDuration: z.number().min(15).max(180).default(60),
  isActive: z.boolean().default(true)
});

// Helper to check if times overlap
function timesOverlap(start1: string, end1: string, start2: string, end2: string): boolean {
  const toMinutes = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  };
  const s1 = toMinutes(start1), e1 = toMinutes(end1);
  const s2 = toMinutes(start2), e2 = toMinutes(end2);
  return s1 < e2 && e1 > s2;
}

// GET /api/appointments/provider-availability - Get provider's availability
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const providerId = searchParams.get('providerId') || session.user.id;
    const date = searchParams.get('date'); // YYYY-MM-DD format for specific date slots

    // Validate provider exists and is staff
    const provider = await User.findById(providerId).select('role').lean();
    if (!provider) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
    }

    const providerRole = String((provider as any).role || '').toLowerCase();
    if (!['dietitian', 'health_counselor'].includes(providerRole)) {
      return NextResponse.json({ error: 'Invalid provider role' }, { status: 400 });
    }

    // Get provider's weekly availability
    const availability = await ProviderAvailability.find({
      providerId,
      isActive: true
    }).sort({ dayOfWeek: 1, startTime: 1 }).lean();

    // If date is provided, generate available time slots for that date
    if (date) {
      const targetDate = new Date(date);
      const dayOfWeek = targetDate.getDay();

      // Get availability for this day
      const dayAvailability = availability.filter(a => a.dayOfWeek === dayOfWeek);

      if (dayAvailability.length === 0) {
        return NextResponse.json({ 
          availability,
          slots: [],
          message: 'No availability set for this day'
        });
      }

      // Get existing appointments for this date
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);

      const existingAppointments = await Appointment.find({
        dietitian: providerId,
        scheduledAt: { $gte: startOfDay, $lte: endOfDay },
        status: { $in: ['scheduled'] }
      }).lean();

      // Generate available slots
      const slots: { time: string; available: boolean; appointmentId?: string }[] = [];

      for (const avail of dayAvailability) {
        const slotDuration = avail.slotDuration || 60;
        const [startHour, startMin] = avail.startTime.split(':').map(Number);
        const [endHour, endMin] = avail.endTime.split(':').map(Number);

        let currentTime = startHour * 60 + startMin;
        const endTime = endHour * 60 + endMin;

        while (currentTime + slotDuration <= endTime) {
          const slotHour = Math.floor(currentTime / 60);
          const slotMin = currentTime % 60;
          const slotTimeStr = `${slotHour.toString().padStart(2, '0')}:${slotMin.toString().padStart(2, '0')}`;

          // Check if slot conflicts with existing appointment
          const slotDate = new Date(targetDate);
          slotDate.setHours(slotHour, slotMin, 0, 0);

          const conflict = existingAppointments.find((apt: any) => {
            const aptStart = new Date(apt.scheduledAt);
            const aptEnd = new Date(aptStart.getTime() + (apt.duration || 60) * 60000);
            const slotEnd = new Date(slotDate.getTime() + slotDuration * 60000);
            return slotDate < aptEnd && slotEnd > aptStart;
          });

          slots.push({
            time: slotTimeStr,
            available: !conflict,
            appointmentId: conflict ? (conflict as any)._id?.toString() : undefined
          });

          currentTime += slotDuration;
        }
      }

      return NextResponse.json({
        availability,
        slots,
        date,
        providerId
      });
    }

    return NextResponse.json({ availability });

  } catch (error) {
    console.error('Error fetching provider availability:', error);
    return NextResponse.json({ error: 'Failed to fetch availability' }, { status: 500 });
  }
}

// POST /api/appointments/provider-availability - Set provider's availability
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sessionRole = String(session.user.role || '').toLowerCase();

    // Only dietitians, health counselors, and admin can set availability
    if (!['dietitian', 'health_counselor', 'admin'].includes(sessionRole)) {
      return NextResponse.json({ error: 'Only staff can set availability' }, { status: 403 });
    }

    await connectDB();

    const body = await request.json();
    const { providerId: bodyProviderId, slots } = body;

    // Determine provider ID
    let providerId = session.user.id;
    let providerRole = sessionRole;

    // Admin can set availability for any provider
    if (sessionRole === 'admin' && bodyProviderId) {
      const provider = await User.findById(bodyProviderId).select('role').lean();
      if (!provider) {
        return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
      }
      providerRole = String((provider as any).role || '').toLowerCase();
      if (!['dietitian', 'health_counselor'].includes(providerRole)) {
        return NextResponse.json({ error: 'Invalid provider role' }, { status: 400 });
      }
      providerId = bodyProviderId;
    }

    if (!Array.isArray(slots) || slots.length === 0) {
      return NextResponse.json({ error: 'At least one availability slot is required' }, { status: 400 });
    }

    // Validate all slots
    const validatedSlots = slots.map((slot, index) => {
      try {
        return availabilitySchema.parse(slot);
      } catch (e) {
        throw new Error(`Invalid slot at index ${index}`);
      }
    });

    // Check for overlaps within the same day
    for (let i = 0; i < validatedSlots.length; i++) {
      for (let j = i + 1; j < validatedSlots.length; j++) {
        if (validatedSlots[i].dayOfWeek === validatedSlots[j].dayOfWeek) {
          if (timesOverlap(
            validatedSlots[i].startTime, validatedSlots[i].endTime,
            validatedSlots[j].startTime, validatedSlots[j].endTime
          )) {
            return NextResponse.json({ 
              error: `Overlapping slots on day ${validatedSlots[i].dayOfWeek}` 
            }, { status: 400 });
          }
        }
      }
    }

    // Delete existing availability for this provider
    await ProviderAvailability.deleteMany({ providerId });

    // Create new availability slots
    const availabilityDocs = validatedSlots.map(slot => ({
      providerId,
      providerRole: providerRole === 'health_counselor' ? 'health_counselor' : 'dietitian',
      ...slot
    }));

    await ProviderAvailability.insertMany(availabilityDocs);

    return NextResponse.json({ 
      message: 'Availability updated successfully',
      count: availabilityDocs.length
    }, { status: 201 });

  } catch (error: any) {
    console.error('Error setting provider availability:', error);
    return NextResponse.json({ error: error.message || 'Failed to set availability' }, { status: 500 });
  }
}

// DELETE /api/appointments/provider-availability - Delete availability slot
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sessionRole = String(session.user.role || '').toLowerCase();

    if (!['dietitian', 'health_counselor', 'admin'].includes(sessionRole)) {
      return NextResponse.json({ error: 'Only staff can manage availability' }, { status: 403 });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const slotId = searchParams.get('id');
    const providerId = searchParams.get('providerId');

    if (slotId) {
      // Delete specific slot
      const slot = await ProviderAvailability.findById(slotId);
      if (!slot) {
        return NextResponse.json({ error: 'Slot not found' }, { status: 404 });
      }

      // Check permission
      if (sessionRole !== 'admin' && slot.providerId.toString() !== session.user.id) {
        return NextResponse.json({ error: 'You can only delete your own availability' }, { status: 403 });
      }

      await ProviderAvailability.findByIdAndDelete(slotId);
      return NextResponse.json({ message: 'Slot deleted successfully' });

    } else if (providerId) {
      // Delete all slots for a provider (admin only or self)
      if (sessionRole !== 'admin' && providerId !== session.user.id) {
        return NextResponse.json({ error: 'You can only delete your own availability' }, { status: 403 });
      }

      await ProviderAvailability.deleteMany({ providerId });
      return NextResponse.json({ message: 'All availability deleted successfully' });

    } else {
      return NextResponse.json({ error: 'Slot ID or provider ID required' }, { status: 400 });
    }

  } catch (error) {
    console.error('Error deleting availability:', error);
    return NextResponse.json({ error: 'Failed to delete availability' }, { status: 500 });
  }
}
