import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import User from '@/lib/db/models/User';
import Appointment from '@/lib/db/models/Appointment';
import { AppointmentType } from '@/lib/db/models/AppointmentConfig';
import { ProviderAvailability } from '@/lib/db/models/AppointmentConfig';
import { UserRole } from '@/types';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

// Lunch break configuration (strictly exclude 2:00 PM to 3:00 PM)
const LUNCH_BREAK_START = 14; // 2:00 PM in 24-hour format
const LUNCH_BREAK_END = 15;   // 3:00 PM in 24-hour format

// Helper function to check if a time slot overlaps with lunch break
function overLapsWithLunchBreak(slotStart: Date, slotEnd: Date): boolean {
  const slotStartHour = slotStart.getHours();
  const slotStartMinutes = slotStart.getMinutes();
  const slotEndHour = slotEnd.getHours();
  const slotEndMinutes = slotEnd.getMinutes();

  // Convert to decimal hours for easier comparison
  const slotStartDecimal = slotStartHour + slotStartMinutes / 60;
  const slotEndDecimal = slotEndHour + slotEndMinutes / 60;

  // Check if any part of the slot overlaps with lunch break (14:00 - 15:00)
  return (slotStartDecimal < LUNCH_BREAK_END && slotEndDecimal > LUNCH_BREAK_START);
}

// GET /api/appointments/available-slots - Get available time slots for a provider
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const dietitianId = searchParams.get('dietitianId') || searchParams.get('providerId');
    const date = searchParams.get('date'); // YYYY-MM-DD format
    const appointmentTypeId = searchParams.get('appointmentTypeId');
    let duration = parseInt(searchParams.get('duration') || '60'); // minutes

    if (!dietitianId || !date) {
      return NextResponse.json(
        { error: 'dietitianId/providerId and date are required' },
        { status: 400 }
      );
    }

    await connectDB();

    // If appointmentTypeId is provided, get the duration from the appointment type
    if (appointmentTypeId) {
      const appointmentType = await AppointmentType.findById(appointmentTypeId).lean();
      if (appointmentType) {
        duration = appointmentType.duration;
      }
    }

    // Get provider details
    const provider = await withCache(
      `appointments:available-slots:provider:${dietitianId}`,
      async () => await User.findById(dietitianId).select('availability role firstName lastName'),
      { ttl: 60000, tags: ['appointments'] }
    );

    if (!provider || (provider.role !== UserRole.DIETITIAN && provider.role !== 'health_counselor')) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
    }

    // Check for custom provider availability settings first
    const customAvailability = await ProviderAvailability.find({
      providerId: dietitianId,
      isActive: true
    }).lean();

    const availability = provider.availability;
    
    // If no availability is set, return empty
    if ((!availability || availability.length === 0) && (!customAvailability || customAvailability.length === 0)) {
      return NextResponse.json({ 
        availableSlots: [],
        duration,
        lunchBreak: { start: '14:00', end: '15:00' },
        message: 'No availability configured for this provider'
      });
    }

    // Parse the requested date
    const requestedDate = new Date(date);
    const dayOfWeek = requestedDate.getDay(); // 0 = Sunday, 6 = Saturday

    // Map day numbers to day names
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayName = dayNames[dayOfWeek];

    // Find ALL schedules for this day of week from both sources
    const daySchedules: Array<{ startTime: string; endTime: string }> = [];
    
    // Add from user's availability array
    if (availability && availability.length > 0) {
      const userDaySchedules = availability.filter((avail: any) => avail.day === dayName);
      daySchedules.push(...userDaySchedules);
    }
    
    // Add from custom ProviderAvailability collection
    if (customAvailability && customAvailability.length > 0) {
      const customDaySchedules = customAvailability.filter(avail => avail.dayOfWeek === dayOfWeek);
      daySchedules.push(...customDaySchedules.map(a => ({ startTime: a.startTime, endTime: a.endTime })));
    }

    if (daySchedules.length === 0) {
      return NextResponse.json({ 
        availableSlots: [],
        duration,
        lunchBreak: { start: '14:00', end: '15:00' },
        message: `Provider is not available on ${dayName}`
      });
    }

    // Get existing appointments for this date
    const startOfDay = new Date(requestedDate);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(requestedDate);
    endOfDay.setHours(23, 59, 59, 999);

    const existingAppointments = await Appointment.find({
      dietitian: dietitianId,
      scheduledAt: {
        $gte: startOfDay,
        $lte: endOfDay
      },
      status: { $in: ['scheduled', 'confirmed', 'rescheduled'] }
    }).select('scheduledAt duration').lean();

    // Generate available time slots from ALL day schedules
    const availableSlots: Array<{ time: string; endTime: string; available: boolean; conflictReason?: string }> = [];

    // Process each schedule for the day
    for (const daySchedule of daySchedules) {
      // Parse start and end times from the day schedule
      const [startHour, startMinute] = daySchedule.startTime.split(':').map(Number);
      const [endHour, endMinute] = daySchedule.endTime.split(':').map(Number);

      const slotStart = new Date(requestedDate);
      slotStart.setHours(startHour, startMinute, 0, 0);

      const slotEnd = new Date(requestedDate);
      slotEnd.setHours(endHour, endMinute, 0, 0);

      // Generate time slots based on the duration
      let currentTime = new Date(slotStart);

      while (currentTime.getTime() + (duration * 60 * 1000) <= slotEnd.getTime()) {
        const slotEndTime = new Date(currentTime.getTime() + (duration * 60 * 1000));

        // Check if slot overlaps with lunch break (strictly 14:00 - 15:00)
        if (overLapsWithLunchBreak(currentTime, slotEndTime)) {
          // Skip this slot - it overlaps with lunch
          currentTime = new Date(currentTime.getTime() + (duration * 60 * 1000));
          continue;
        }

        // PRECISE CONFLICT DETECTION: Check if this slot EXACTLY overlaps with existing appointments
        // A conflict occurs ONLY when the proposed slot's time range intersects with an existing appointment's time range
        let hasConflict = false;
        let conflictReason = '';
        
        for (const appointment of existingAppointments) {
          const existingStart = new Date(appointment.scheduledAt);
          const existingEnd = new Date(existingStart.getTime() + (appointment.duration * 60 * 1000));

          // Precise overlap check: slot overlaps if:
          // - slot starts before existing ends AND slot ends after existing starts
          // This means:
          // - slot 10:00-10:30 does NOT conflict with booking 10:30-11:00 (adjacent, no overlap)
          // - slot 10:00-10:30 DOES conflict with booking 10:00-10:30 (exact same)
          // - slot 10:00-10:30 DOES conflict with booking 09:45-10:15 (partial overlap)
          // - slot 10:00-10:30 DOES conflict with booking 10:15-10:45 (partial overlap)
          
          const slotStartMs = currentTime.getTime();
          const slotEndMs = slotEndTime.getTime();
          const existingStartMs = existingStart.getTime();
          const existingEndMs = existingEnd.getTime();

          // Strict overlap: start < otherEnd AND end > otherStart
          if (slotStartMs < existingEndMs && slotEndMs > existingStartMs) {
            hasConflict = true;
            const existingTimeStr = existingStart.toTimeString().slice(0, 5);
            const existingEndTimeStr = existingEnd.toTimeString().slice(0, 5);
            conflictReason = `Conflicts with booking ${existingTimeStr}-${existingEndTimeStr}`;
            break;
          }
        }

        // Check if slot is not in the past
        const now = new Date();
        const isInFuture = currentTime > now;
        
        const timeString = currentTime.toTimeString().slice(0, 5); // HH:MM format
        const endTimeString = slotEndTime.toTimeString().slice(0, 5);

        // Only add if not already in the list
        const existingSlot = availableSlots.find(s => s.time === timeString);
        if (!existingSlot) {
          const slotData: { time: string; endTime: string; available: boolean; conflictReason?: string } = {
            time: timeString,
            endTime: endTimeString,
            available: !hasConflict && isInFuture
          };
          
          if (hasConflict) {
            slotData.conflictReason = conflictReason;
          } else if (!isInFuture) {
            slotData.conflictReason = 'Past time';
          }
          
          availableSlots.push(slotData);
        }

        // Move to next slot based on duration
        currentTime = new Date(currentTime.getTime() + (duration * 60 * 1000));
      }
    }

    // Sort slots by time
    availableSlots.sort((a, b) => a.time.localeCompare(b.time));

    // Filter to only return available slots (for backward compatibility, also include a list of just times)
    const availableSlotsOnly = availableSlots.filter(s => s.available).map(s => s.time);

    return NextResponse.json({
      date,
      providerId: dietitianId,
      providerName: `${provider.firstName} ${provider.lastName}`,
      duration,
      lunchBreak: { 
        start: `${LUNCH_BREAK_START}:00`, 
        end: `${LUNCH_BREAK_END}:00`,
        message: 'Appointments are not available during lunch break (2:00 PM - 3:00 PM)'
      },
      // Full slot details with availability status
      slots: availableSlots,
      // Simple array of available times (backward compatible)
      availableSlots: availableSlotsOnly,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    });

  } catch (error) {
    console.error('Error fetching available slots:', error);
    return NextResponse.json(
      { error: 'Failed to fetch available slots' },
      { status: 500 }
    );
  }
}
