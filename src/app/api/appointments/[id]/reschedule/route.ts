import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import Appointment from '@/lib/db/models/Appointment';
import User from '@/lib/db/models/User';
import { updateCalendarEvent } from '@/lib/services/googleCalendar';
import { UserRole, AppointmentStatus, AppointmentActorRole } from '@/types';
import { logHistoryServer } from '@/lib/server/history';
import { sendNotificationToUser } from '@/lib/firebase/firebaseNotification';
import { socketManager } from '@/lib/realtime/socket-manager';
import { clearCacheByTag } from '@/lib/api/utils';
import { sendAppointmentRescheduleEmail, AppointmentEmailData } from '@/lib/services/appointmentEmail';
import { updateMeetingLink } from '@/lib/services/meetingLink';

// Helper function to get actor role from user role
function getActorRole(role: string): AppointmentActorRole {
  if (role === UserRole.ADMIN || role === 'admin') return 'admin';
  if (role === UserRole.DIETITIAN || role === 'dietitian') return 'dietitian';
  if (role === UserRole.HEALTH_COUNSELOR || role === 'health_counselor') return 'health_counselor';
  return 'client';
}

// POST /api/appointments/[id]/reschedule - Reschedule an appointment
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { scheduledAt, duration, reason } = body;

    if (!scheduledAt) {
      return NextResponse.json({ error: 'New scheduled date/time is required' }, { status: 400 });
    }

    await connectDB();
    const { id } = await params;

    const appointment = await Appointment.findById(id);
    if (!appointment) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
    }

    // Check if user can reschedule this appointment
    let canReschedule = false;
    const clientId = appointment.client?.toString();
    const dietitianId = appointment.dietitian?.toString();
    const userRole = session.user.role as string;

    if (userRole === UserRole.ADMIN || userRole === 'admin') {
      canReschedule = true;
    } else if (userRole === UserRole.DIETITIAN || userRole === 'dietitian') {
      // Dietitian can reschedule appointments they created
      if ((appointment as any).createdBy?.toString() === session.user.id) {
        canReschedule = true;
      }
    } else if (userRole === UserRole.HEALTH_COUNSELOR || userRole === 'health_counselor') {
      // Health counselor can reschedule appointments they created
      if ((appointment as any).createdBy?.toString() === session.user.id) {
        canReschedule = true;
      }
    } else if (userRole === UserRole.CLIENT || userRole === 'client') {
      // Client can reschedule their own appointments (within policy limits)
      if (clientId === session.user.id) {
        canReschedule = true;
      }
    }

    if (!canReschedule) {
      return NextResponse.json({ error: 'You are not authorized to reschedule this appointment' }, { status: 403 });
    }

    // Check if appointment can be rescheduled (not already cancelled or completed)
    if (appointment.status === AppointmentStatus.CANCELLED ||
      appointment.status === AppointmentStatus.COMPLETED) {
      return NextResponse.json({
        error: `Cannot reschedule a ${appointment.status} appointment`
      }, { status: 400 });
    }

    const newScheduledAt = new Date(scheduledAt);
    const previousScheduledAt = new Date(appointment.scheduledAt);
    const newDuration = duration || appointment.duration;

    // Check for scheduling conflicts
    const conflicts = await Appointment.findConflicts(
      dietitianId!,
      newScheduledAt,
      newDuration,
      id
    );

    if (conflicts.length > 0) {
      return NextResponse.json(
        { error: 'Time slot conflicts with existing appointment' },
        { status: 409 }
      );
    }

    // Get actor role and name for lifecycle tracking
    const actorRole = getActorRole(userRole);
    const actorName = session.user.name || 'Unknown User';

    // Add lifecycle event for rescheduling
    const lifecycleEvent: import('@/types').IAppointmentLifecycleEvent = {
      action: 'rescheduled',
      performedBy: session.user.id,
      performedByRole: actorRole,
      performedByName: actorName,
      timestamp: new Date(),
      previousScheduledAt,
      newScheduledAt,
      details: {
        previousDuration: appointment.duration,
        newDuration,
        reason: reason || undefined
      }
    };

    if (!appointment.lifecycleHistory) {
      appointment.lifecycleHistory = [];
    }
    appointment.lifecycleHistory.push(lifecycleEvent);

    // Set rescheduledBy info
    appointment.rescheduledBy = {
      userId: session.user.id,
      role: actorRole,
      name: actorName,
      timestamp: new Date(),
      previousScheduledAt
    };

    // Update appointment
    appointment.scheduledAt = newScheduledAt;
    appointment.duration = newDuration;

    await appointment.save();

    // Update meeting link if applicable (Google Meet currently requires no update)
    const meetingProvider = ((appointment as any).meetingProvider || 'google_meet') as 'zoom' | 'google_meet';
    const meetingId = appointment.zoomMeeting?.meetingId || appointment.meetingLink;

    if (meetingId) {
      try {
        await updateMeetingLink(
          meetingId,
          meetingProvider,
          {
            scheduledAt: newScheduledAt,
            duration: newDuration
          }
        );
      } catch (meetingError) {
        console.error('Failed to update meeting link:', meetingError);
      }
    }

    // Populate and return updated appointment
    await appointment.populate('dietitian', 'firstName lastName email avatar');
    await appointment.populate('client', 'firstName lastName email avatar');

    const dietitianData = appointment.dietitian as any;
    const clientData = appointment.client as any;

    // Update Google Calendar events
    try {
      const googleCalendarEventId = (appointment as any).googleCalendarEventId;
      const updateData = {
        scheduledAt: newScheduledAt,
        duration: newDuration
      };

      if (googleCalendarEventId?.dietitian) {
        await updateCalendarEvent(
          dietitianId!,
          googleCalendarEventId.dietitian,
          updateData
        );
      }

      if (googleCalendarEventId?.client) {
        await updateCalendarEvent(
          clientId!,
          googleCalendarEventId.client,
          updateData
        );
      }
    } catch (calendarError) {
      console.error('Failed to update Google Calendar events:', calendarError);
    }

    // Send reschedule emails
    try {
      const providerRole: 'dietitian' | 'health_counselor' =
        actorRole === 'health_counselor' ? 'health_counselor' : 'dietitian';

      const emailData: AppointmentEmailData = {
        appointmentId: appointment._id.toString(),
        clientName: `${clientData?.firstName || ''} ${clientData?.lastName || ''}`.trim(),
        clientEmail: clientData?.email || '',
        providerName: `${dietitianData?.firstName || ''} ${dietitianData?.lastName || ''}`.trim(),
        providerEmail: dietitianData?.email || '',
        providerRole,
        appointmentType: appointment.type || 'Consultation',
        appointmentMode: (appointment as any).modeName || 'In-Person',
        scheduledAt: newScheduledAt,
        duration: newDuration,
        meetingLink: appointment.meetingLink,
        rescheduledBy: {
          name: actorName,
          role: actorRole,
          previousDateTime: previousScheduledAt
        }
      };

      const emailResult = await sendAppointmentRescheduleEmail(emailData);

      if (!emailResult.success) {
        console.warn('Some reschedule emails failed:', emailResult.errors);
      }
    } catch (emailError) {
      console.error('Failed to send reschedule emails:', emailError);
    }

    // Clear cache
    clearCacheByTag('appointments');

    // Log history
    const rescheduledByLabel = actorRole === 'client' ? 'Client' :
      actorRole === 'dietitian' ? 'Dietitian' :
        actorRole === 'health_counselor' ? 'Health Counselor' : 'Admin';

    await logHistoryServer({
      userId: clientId!,
      action: 'update',
      category: 'appointment',
      description: `Appointment rescheduled by ${rescheduledByLabel} from ${previousScheduledAt.toLocaleString()} to ${newScheduledAt.toLocaleString()}`,
      performedById: session.user.id,
      metadata: {
        appointmentId: appointment._id,
        previousScheduledAt,
        newScheduledAt,
        rescheduledBy: actorRole,
        rescheduledByName: actorName
      }
    });

    // Send real-time notifications
    try {
      const formattedNewDate = newScheduledAt.toLocaleDateString('en-IN', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'Asia/Kolkata'
      });

      const dietitianIdStr = dietitianData?._id?.toString() || dietitianId;
      const clientIdStr = clientData?._id?.toString() || clientId;

      // Notify client if rescheduled by staff
      if (actorRole !== 'client' && clientIdStr) {
        await sendNotificationToUser(clientIdStr, {
          title: '🔄 Appointment Rescheduled',
          body: `Your appointment has been rescheduled to ${formattedNewDate}`,
          icon: dietitianData?.avatar || '/icons/icon-192x192.png',
          data: {
            type: 'appointment_rescheduled',
            appointmentId: appointment._id.toString(),
            rescheduledBy: rescheduledByLabel
          },
          clickAction: `/user/appointments`,
        });

        socketManager.sendToUser(clientIdStr, 'appointment_rescheduled', {
          appointmentId: appointment._id,
          rescheduledBy: actorRole,
          rescheduledByLabel,
          rescheduledByName: actorName,
          previousScheduledAt,
          newScheduledAt,
          timestamp: Date.now()
        });
      }

      // Notify dietitian if rescheduled by client
      if (actorRole === 'client' && dietitianIdStr) {
        const clientName = `${clientData?.firstName || ''} ${clientData?.lastName || ''}`.trim();
        await sendNotificationToUser(dietitianIdStr, {
          title: '🔄 Appointment Rescheduled',
          body: `${clientName} has rescheduled their appointment to ${formattedNewDate}`,
          icon: clientData?.avatar || '/icons/icon-192x192.png',
          data: {
            type: 'appointment_rescheduled',
            appointmentId: appointment._id.toString(),
            rescheduledBy: rescheduledByLabel
          },
          clickAction: `/appointments`,
        });

        socketManager.sendToUser(dietitianIdStr, 'appointment_rescheduled', {
          appointmentId: appointment._id,
          rescheduledBy: actorRole,
          rescheduledByLabel,
          rescheduledByName: actorName,
          previousScheduledAt,
          newScheduledAt,
          client: {
            _id: clientIdStr,
            firstName: clientData?.firstName,
            lastName: clientData?.lastName,
          },
          timestamp: Date.now()
        });
      }
    } catch (notificationError) {
      console.error('Failed to send reschedule notification:', notificationError);
    }

    return NextResponse.json({
      success: true,
      appointment,
      rescheduledBy: {
        role: actorRole,
        name: actorName
      },
      previousScheduledAt,
      newScheduledAt
    });

  } catch (error) {
    console.error('Error rescheduling appointment:', error);
    return NextResponse.json(
      { error: 'Failed to reschedule appointment' },
      { status: 500 }
    );
  }
}
