import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import Appointment from '@/lib/db/models/Appointment';
import User from '@/lib/db/models/User';
import { removeAppointmentFromCalendars, updateCalendarEvent } from '@/lib/services/googleCalendar';
import { UserRole, AppointmentStatus, AppointmentActorRole } from '@/types';
import { logHistoryServer } from '@/lib/server/history';
import { sendNotificationToUser } from '@/lib/firebase/firebaseNotification';
import { socketManager } from '@/lib/realtime/socket-manager';
import { withCache, clearCacheByTag } from '@/lib/api/utils';
import {
  sendAppointmentCancellationEmail,
  sendAppointmentRescheduleEmail,
  AppointmentEmailData
} from '@/lib/services/appointmentEmail';

// Helper function to get actor role from user role
function getActorRole(role: string): AppointmentActorRole {
  if (role === UserRole.ADMIN || role === 'admin') return 'admin';
  if (role === UserRole.DIETITIAN || role === 'dietitian') return 'dietitian';
  if (role === UserRole.HEALTH_COUNSELOR || role === 'health_counselor') return 'health_counselor';
  return 'client';
}

// GET /api/appointments/[id] - Get specific appointment
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [session] = await Promise.all([
      getServerSession(authOptions),
      connectDB(),
    ]);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const appointment = await withCache(
      `appointments:id:${JSON.stringify(id)}`,
      async () => await Appointment.findById(id)
        .populate('dietitian', 'firstName lastName email avatar')
        .populate('client', 'firstName lastName email avatar')
        .populate('createdBy', 'firstName lastName role')
        .select('+lifecycleHistory +cancelledBy +rescheduledBy'),
      { ttl: 60000, tags: ['appointments'] }
    );

    if (!appointment) {
      return NextResponse.json(
        { error: 'Appointment not found' },
        { status: 404 }
      );
    }

    // Check if user has access to this appointment
    const dietitianId = (appointment.dietitian as any)._id?.toString() || (appointment.dietitian as any).toString();
    const clientId = (appointment.client as any)._id?.toString() || (appointment.client as any).toString();
    const userId = session.user.id;

    let hasAccess = false;

    if (session.user.role === UserRole.ADMIN) {
      hasAccess = true;
    } else if (dietitianId === userId || clientId === userId) {
      hasAccess = true;
    } else if ((session.user.role as string) === UserRole.HEALTH_COUNSELOR || (session.user.role as string) === 'health_counselor') {
      // HC can access appointments for their assigned clients
      const client = await withCache(
        `appointments:id:${JSON.stringify(clientId)}`,
        async () => await User.findById(clientId),
        { ttl: 60000, tags: ['appointments'] }
      );
      if (client?.assignedHealthCounselor?.toString() === userId) {
        hasAccess = true;
      }
    }

    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json(appointment);

  } catch (error) {
    console.error('Error fetching appointment:', error);
    return NextResponse.json(
      { error: 'Failed to fetch appointment' },
      { status: 500 }
    );
  }
}

// PUT /api/appointments/[id] - Update appointment
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [session, , body, { id }] = await Promise.all([
      getServerSession(authOptions),
      connectDB(),
      request.json(),
      params,
    ]);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const appointment = await withCache(
      `appointments:id:${JSON.stringify(id)}`,
      async () => await Appointment.findById(id),
      { ttl: 60000, tags: ['appointments'] }
    );
    if (!appointment) {
      return NextResponse.json(
        { error: 'Appointment not found' },
        { status: 404 }
      );
    }



    // Check if user can update this appointment
    // Admin can update any, dietitian and HC can update appointments they created
    // Clients can only cancel their own appointments (change status to cancelled)
    let canUpdate = false;
    let isClientCancelling = false;

    const clientId = appointment.client?.toString();
    const dietitianId = appointment.dietitian?.toString();
    const userRole = session.user.role as string;

    if (userRole === UserRole.ADMIN || userRole === 'admin') {
      canUpdate = true;
    } else if (userRole === UserRole.DIETITIAN || userRole === 'dietitian') {
      // Dietitian can update appointments they created OR where they are the assigned dietitian
      if ((appointment as any).createdBy?.toString() === session.user.id || dietitianId === session.user.id) {
        canUpdate = true;
      }
    } else if (userRole === UserRole.HEALTH_COUNSELOR || userRole === 'health_counselor') {
      // Health counselor can update appointments they created
      if ((appointment as any).createdBy?.toString() === session.user.id) {
        canUpdate = true;
      } else {
        // Also check if HC is assigned to the client
        const client = await User.findById(clientId).select('assignedHealthCounselor');
        if (client?.assignedHealthCounselor?.toString() === session.user.id) {
          canUpdate = true;
        }
      }
    } else if (userRole === UserRole.CLIENT || userRole === 'client') {
      // Client can only cancel their own appointments
      if (clientId === session.user.id && body.status === 'cancelled') {
        canUpdate = true;
        isClientCancelling = true;
      }
    }

    if (!canUpdate) {
      return NextResponse.json({ error: 'You do not have permission to edit this appointment' }, { status: 403 });
    }

    // Track if status is changing to cancelled
    const isBeingCancelled = body.status === 'cancelled' && appointment.status !== 'cancelled';

    // If updating schedule, check for conflicts
    if (body.scheduledAt || body.duration) {
      const newScheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : appointment.scheduledAt;
      const newDuration = body.duration || appointment.duration;

      const conflicts = await Appointment.findConflicts(
        appointment.dietitian.toString(),
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
    }

    // Track the previous schedule for reschedule tracking
    const previousScheduledAt = new Date(appointment.scheduledAt);
    const isRescheduling = body.scheduledAt && new Date(body.scheduledAt).getTime() !== previousScheduledAt.getTime();

    // Track lifecycle event
    const actorRole = getActorRole(userRole);
    const actorName = session.user.name || 'Unknown User';

    // Handle cancellation with lifecycle tracking
    if (isBeingCancelled) {
      // Add to lifecycle history
      const lifecycleEvent: any = {
        action: 'cancelled' as const,
        performedBy: session.user.id,
        performedByRole: actorRole,
        performedByName: actorName,
        timestamp: new Date(),
        details: { reason: body.cancellationReason || undefined }
      };

      if (!appointment.lifecycleHistory) {
        appointment.lifecycleHistory = [];
      }
      appointment.lifecycleHistory.push(lifecycleEvent);

      // Set cancelledBy info
      appointment.cancelledBy = {
        userId: session.user.id,
        role: actorRole,
        name: actorName,
        timestamp: new Date(),
        reason: body.cancellationReason || undefined
      };
    }

    // Handle rescheduling with lifecycle tracking
    if (isRescheduling) {
      const lifecycleEvent: any = {
        action: 'rescheduled' as const,
        performedBy: session.user.id,
        performedByRole: actorRole,
        performedByName: actorName,
        timestamp: new Date(),
        details: {
          previousScheduledAt,
          newScheduledAt: new Date(body.scheduledAt),
          previousDuration: appointment.duration,
          newDuration: body.duration || appointment.duration
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

      // Update status to rescheduled (but keep it scheduled for active appointments)
      // Don't change status if explicitly setting a different one
      if (!body.status) {
        body.status = AppointmentStatus.SCHEDULED;
      }
    }

    // Update appointment fields
    Object.assign(appointment, body);
    await appointment.save();

    // Populate and return updated appointment
    await appointment.populate('dietitian', 'firstName lastName email avatar');
    await appointment.populate('client', 'firstName lastName email avatar');

    // Get populated data for emails and notifications
    const dietitianData = appointment.dietitian as any;
    const clientData = appointment.client as any;
    const dietitianIdStr = dietitianData?._id?.toString() || dietitianId;
    const clientIdStr = clientData?._id?.toString() || clientId;

    // Send cancellation emails if the appointment was cancelled
    if (isBeingCancelled) {
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
          scheduledAt: appointment.scheduledAt,
          duration: appointment.duration,
          meetingLink: appointment.meetingLink,
          cancelledBy: {
            name: actorName,
            role: actorRole,
            reason: body.cancellationReason
          }
        };

        const emailResult = await sendAppointmentCancellationEmail(emailData);

        if (!emailResult.success) {
          console.warn('Some cancellation emails failed:', emailResult.errors);
        }
      } catch (emailError) {
        console.error('Failed to send cancellation emails:', emailError);
      }
    }

    // Send reschedule emails if the appointment was rescheduled
    if (isRescheduling && !isBeingCancelled) {
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
          scheduledAt: appointment.scheduledAt,
          duration: appointment.duration,
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
    }

    // Update Google Calendar if schedule changed
    if (body.scheduledAt || body.duration) {
      try {
        const googleCalendarEventId = (appointment as any).googleCalendarEventId;
        const updateData = {
          scheduledAt: appointment.scheduledAt,
          duration: appointment.duration
        };

        // Update dietitian's calendar
        if (googleCalendarEventId?.dietitian) {
          await updateCalendarEvent(
            appointment.dietitian.toString(),
            googleCalendarEventId.dietitian,
            updateData
          );
        }

        // Update client's calendar
        if (googleCalendarEventId?.client) {
          await updateCalendarEvent(
            appointment.client.toString(),
            googleCalendarEventId.client,
            updateData
          );
        }
      } catch (calendarError) {
        console.error('Failed to update Google Calendar events:', calendarError);
        // Don't fail the update if calendar sync fails
      }
    }

    // Clear cache after update
    clearCacheByTag('appointments');

    // Log history for appointment update
    await logHistoryServer({
      userId: clientIdStr,
      action: 'update',
      category: 'appointment',
      description: `Appointment ${isBeingCancelled ? 'cancelled by ' + actorRole : isRescheduling ? 'rescheduled by ' + actorRole : 'updated'}`,
      performedById: session.user.id,
      metadata: {
        appointmentId: appointment._id,
        changes: Object.keys(body),
        status: appointment.status,
        cancelledBy: isBeingCancelled ? actorRole : undefined,
        rescheduledBy: isRescheduling ? actorRole : undefined
      }
    });

    // Send notifications if appointment was cancelled
    if (isBeingCancelled) {
      try {
        const formattedDate = new Date(appointment.scheduledAt).toLocaleDateString('en-IN', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          timeZone: 'Asia/Kolkata'
        });

        const cancelledByLabel = actorRole === 'client' ? 'Client' :
          actorRole === 'dietitian' ? 'Dietitian' :
            actorRole === 'health_counselor' ? 'Health Counselor' : 'Admin';

        if (isClientCancelling) {
          // Client cancelled - notify dietitian/health counselor
          const clientName = `${clientData?.firstName || ''} ${clientData?.lastName || ''}`.trim() || 'Client';

          // Send push notification to dietitian
          if (dietitianIdStr) {
            await sendNotificationToUser(dietitianIdStr, {
              title: '❌ Appointment Cancelled',
              body: `${clientName} has cancelled the ${appointment.type || 'consultation'} scheduled for ${formattedDate}`,
              icon: clientData?.avatar || '/icons/icon-192x192.png',
              data: {
                type: 'appointment_cancelled',
                appointmentId: appointment._id.toString(),
                clientId: clientIdStr || '',
                cancelledBy: cancelledByLabel
              },
              clickAction: `/appointments`,
            });

            // Send SSE notification
            socketManager.sendToUser(dietitianIdStr, 'appointment_cancelled', {
              appointmentId: appointment._id,
              cancelledBy: actorRole,
              cancelledByLabel,
              cancelledByName: actorName,
              client: {
                _id: clientIdStr,
                firstName: clientData?.firstName,
                lastName: clientData?.lastName,
              },
              scheduledAt: appointment.scheduledAt,
              timestamp: Date.now()
            });
          }
        } else {
          // Staff cancelled - notify client
          const staffName = `${dietitianData?.firstName || ''} ${dietitianData?.lastName || ''}`.trim() || 'Your dietitian';

          // Send push notification to client
          if (clientIdStr) {
            await sendNotificationToUser(clientIdStr, {
              title: '❌ Appointment Cancelled',
              body: `Your ${appointment.type || 'consultation'} with ${staffName} on ${formattedDate} has been cancelled`,
              icon: dietitianData?.avatar || '/icons/icon-192x192.png',
              data: {
                type: 'appointment_cancelled',
                appointmentId: appointment._id.toString(),
                dietitianId: dietitianIdStr || '',
                cancelledBy: cancelledByLabel
              },
              clickAction: `/user/appointments`,
            });

            // Send SSE notification
            socketManager.sendToUser(clientIdStr, 'appointment_cancelled', {
              appointmentId: appointment._id,
              cancelledBy: actorRole,
              cancelledByLabel,
              cancelledByName: actorName,
              dietitian: {
                _id: dietitianIdStr,
                firstName: dietitianData?.firstName,
                lastName: dietitianData?.lastName,
              },
              scheduledAt: appointment.scheduledAt,
              timestamp: Date.now()
            });
          }
        }
      } catch (notificationError) {
        console.error('Failed to send cancellation notification:', notificationError);
        // Don't fail the request if notification fails
      }
    }

    // Send notifications if appointment was rescheduled
    if (isRescheduling && !isBeingCancelled) {
      try {
        const formattedNewDate = new Date(appointment.scheduledAt).toLocaleDateString('en-IN', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          timeZone: 'Asia/Kolkata'
        });

        const rescheduledByLabel = actorRole === 'client' ? 'Client' :
          actorRole === 'dietitian' ? 'Dietitian' :
            actorRole === 'health_counselor' ? 'Health Counselor' : 'Admin';

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
            newScheduledAt: appointment.scheduledAt,
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
            newScheduledAt: appointment.scheduledAt,
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
    }

    return NextResponse.json(appointment);

  } catch (error) {
    console.error('Error updating appointment:', error);
    return NextResponse.json(
      { error: 'Failed to update appointment' },
      { status: 500 }
    );
  }
}

// DELETE /api/appointments/[id] - Cancel appointment
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [session, , { id }] = await Promise.all([
      getServerSession(authOptions),
      connectDB(),
      params,
    ]);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const appointment = await withCache(
      `appointments:id:${JSON.stringify(id)}`,
      async () => await Appointment.findById(id),
      { ttl: 60000, tags: ['appointments'] }
    );
    if (!appointment) {
      return NextResponse.json(
        { error: 'Appointment not found' },
        { status: 404 }
      );
    }

    // Check if user can cancel this appointment
    // Admin can cancel any, dietitian and HC can cancel appointments they created
    // Clients can cancel their own appointments
    let canCancel = false;
    let isClientCancellingDelete = false;

    const clientIdDelete = appointment.client?.toString();
    const dietitianIdDelete = appointment.dietitian?.toString();
    const userRoleDelete = session.user.role as string;

    if (userRoleDelete === UserRole.ADMIN || userRoleDelete === 'admin') {
      canCancel = true;
    } else if (userRoleDelete === UserRole.DIETITIAN || userRoleDelete === 'dietitian') {
      // Dietitian can cancel appointments they created OR where they are the assigned dietitian
      if ((appointment as any).createdBy?.toString() === session.user.id || dietitianIdDelete === session.user.id) {
        canCancel = true;
      }
    } else if (userRoleDelete === UserRole.HEALTH_COUNSELOR || userRoleDelete === 'health_counselor') {
      // Health counselor can cancel appointments they created
      if ((appointment as any).createdBy?.toString() === session.user.id) {
        canCancel = true;
      } else {
        // Also check if HC is assigned to the client
        const client = await User.findById(clientIdDelete).select('assignedHealthCounselor');
        if (client?.assignedHealthCounselor?.toString() === session.user.id) {
          canCancel = true;
        }
      }
    } else if (userRoleDelete === UserRole.CLIENT || userRoleDelete === 'client') {
      // Client can cancel their own appointments
      if (clientIdDelete === session.user.id) {
        canCancel = true;
        isClientCancellingDelete = true;
      }
    }

    if (!canCancel) {
      return NextResponse.json({ error: 'You do not have permission to cancel this appointment' }, { status: 403 });
    }

    // Get actor role and name for lifecycle tracking
    const actorRoleDelete = getActorRole(userRoleDelete);
    const actorNameDelete = session.user.name || 'Unknown User';

    // Remove from Google Calendar before cancelling
    try {
      const googleCalendarEventId = (appointment as any).googleCalendarEventId;
      if (googleCalendarEventId?.dietitian || googleCalendarEventId?.client) {
        const calendarResult = await removeAppointmentFromCalendars(
          appointment.dietitian.toString(),
          appointment.client.toString(),
          googleCalendarEventId?.dietitian,
          googleCalendarEventId?.client
        );

        if (calendarResult.errors.length > 0) {
          console.warn('Google Calendar removal warnings:', calendarResult.errors);
        }

        // Clear the calendar event IDs
        (appointment as any).googleCalendarEventId = {
          dietitian: undefined,
          client: undefined
        };
      }
    } catch (calendarError) {
      console.error('Failed to remove appointment from Google Calendar:', calendarError);
      // Don't fail the cancellation if calendar removal fails
    }

    // Add lifecycle tracking for cancellation
    const lifecycleEvent: any = {
      action: 'cancelled' as const,
      performedBy: session.user.id,
      performedByRole: actorRoleDelete,
      performedByName: actorNameDelete,
      timestamp: new Date(),
      details: { reason: 'Appointment cancelled via delete action' }
    };

    if (!appointment.lifecycleHistory) {
      appointment.lifecycleHistory = [];
    }
    appointment.lifecycleHistory.push(lifecycleEvent);

    // Set cancelledBy info
    appointment.cancelledBy = {
      userId: session.user.id,
      role: actorRoleDelete,
      name: actorNameDelete,
      timestamp: new Date()
    };

    // Update status to cancelled instead of deleting
    appointment.status = AppointmentStatus.CANCELLED;
    await appointment.save();

    // Clear cache after cancellation
    clearCacheByTag('appointments');

    // Get user details for notifications
    const dietitian = await withCache(
      `appointments:id:${JSON.stringify(appointment.dietitian)}`,
      async () => await User.findById(appointment.dietitian).select('firstName lastName avatar email'),
      { ttl: 60000, tags: ['appointments'] }
    );
    const client = await withCache(
      `appointments:id:${JSON.stringify(appointment.client)}`,
      async () => await User.findById(appointment.client).select('firstName lastName avatar email'),
      { ttl: 60000, tags: ['appointments'] }
    );

    // Send cancellation emails
    try {
      const providerRoleEmail: 'dietitian' | 'health_counselor' =
        actorRoleDelete === 'health_counselor' ? 'health_counselor' : 'dietitian';

      const emailData: AppointmentEmailData = {
        appointmentId: appointment._id.toString(),
        clientName: client ? `${client.firstName} ${client.lastName}` : 'Client',
        clientEmail: client?.email || '',
        providerName: dietitian ? `${dietitian.firstName} ${dietitian.lastName}` : 'Provider',
        providerEmail: dietitian?.email || '',
        providerRole: providerRoleEmail,
        appointmentType: appointment.type || 'Consultation',
        appointmentMode: (appointment as any).modeName || 'In-Person',
        scheduledAt: appointment.scheduledAt,
        duration: appointment.duration,
        meetingLink: appointment.meetingLink,
        cancelledBy: {
          name: actorNameDelete,
          role: actorRoleDelete
        }
      };

      const emailResult = await sendAppointmentCancellationEmail(emailData);

      if (!emailResult.success) {
        console.warn('Some cancellation emails failed:', emailResult.errors);
      }
    } catch (emailError) {
      console.error('Failed to send cancellation emails:', emailError);
    }

    // Log history for appointment cancellation
    const cancelledByLabel = actorRoleDelete === 'client' ? 'Client' :
      actorRoleDelete === 'dietitian' ? 'Dietitian' :
        actorRoleDelete === 'health_counselor' ? 'Health Counselor' : 'Admin';

    await logHistoryServer({
      userId: appointment.client.toString(),
      action: 'delete',
      category: 'appointment',
      description: `Appointment cancelled by ${cancelledByLabel}`,
      performedById: session.user.id,
      metadata: {
        appointmentId: appointment._id,
        scheduledAt: appointment.scheduledAt,
        type: appointment.type,
        cancelledBy: actorRoleDelete,
        cancelledByName: actorNameDelete
      }
    });

    // Send cancellation notifications
    try {
      const formattedDate = new Date(appointment.scheduledAt).toLocaleDateString('en-IN', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'Asia/Kolkata'
      });

      const dietitianName = dietitian ? `${dietitian.firstName || ''} ${dietitian.lastName || ''}`.trim() : 'Your dietitian';
      const clientName = client ? `${client.firstName || ''} ${client.lastName || ''}`.trim() : 'Client';

      if (isClientCancellingDelete) {
        // Client cancelled - notify dietitian
        if (dietitian) {
          await sendNotificationToUser(appointment.dietitian.toString(), {
            title: '❌ Appointment Cancelled',
            body: `${clientName} has cancelled the ${appointment.type || 'consultation'} scheduled for ${formattedDate}`,
            icon: client?.avatar || '/icons/icon-192x192.png',
            data: {
              type: 'appointment_cancelled',
              appointmentId: appointment._id.toString(),
              clientId: appointment.client.toString(),
              cancelledBy: cancelledByLabel
            },
            clickAction: `/appointments`,
          });

          socketManager.sendToUser(appointment.dietitian.toString(), 'appointment_cancelled', {
            appointmentId: appointment._id,
            cancelledBy: actorRoleDelete,
            cancelledByLabel,
            cancelledByName: actorNameDelete,
            client: client ? {
              _id: client._id,
              firstName: client.firstName,
              lastName: client.lastName,
            } : null,
            scheduledAt: appointment.scheduledAt,
            timestamp: Date.now()
          });
        }
      } else {
        // Staff cancelled - notify client
        if (client) {
          await sendNotificationToUser(appointment.client.toString(), {
            title: '❌ Appointment Cancelled',
            body: `Your ${appointment.type || 'consultation'} with ${dietitianName} on ${formattedDate} has been cancelled by ${cancelledByLabel}`,
            icon: dietitian?.avatar || '/icons/icon-192x192.png',
            data: {
              type: 'appointment_cancelled',
              appointmentId: appointment._id.toString(),
              dietitianId: appointment.dietitian.toString(),
              cancelledBy: cancelledByLabel
            },
            clickAction: `/user/appointments`,
          });

          socketManager.sendToUser(appointment.client.toString(), 'appointment_cancelled', {
            appointmentId: appointment._id,
            cancelledBy: actorRoleDelete,
            cancelledByLabel,
            cancelledByName: actorNameDelete,
            dietitian: dietitian ? {
              _id: dietitian._id,
              firstName: dietitian.firstName,
              lastName: dietitian.lastName,
            } : null,
            scheduledAt: appointment.scheduledAt,
            timestamp: Date.now()
          });
        }

        // Also notify dietitian if someone else cancelled
        if (session.user.id !== appointment.dietitian.toString() && dietitian) {
          await sendNotificationToUser(appointment.dietitian.toString(), {
            title: '❌ Appointment Cancelled',
            body: `Appointment with ${clientName} on ${formattedDate} has been cancelled by ${cancelledByLabel}`,
            icon: client?.avatar || '/icons/icon-192x192.png',
            data: {
              type: 'appointment_cancelled',
              appointmentId: appointment._id.toString(),
              clientId: appointment.client.toString(),
              cancelledBy: cancelledByLabel
            },
            clickAction: `/appointments`,
          });

          socketManager.sendToUser(appointment.dietitian.toString(), 'appointment_cancelled', {
            appointmentId: appointment._id,
            cancelledBy: actorRoleDelete,
            cancelledByLabel,
            cancelledByName: actorNameDelete,
            client: client ? {
              _id: client._id,
              firstName: client.firstName,
              lastName: client.lastName,
            } : null,
            scheduledAt: appointment.scheduledAt,
            timestamp: Date.now()
          });
        }
      }
    } catch (notificationError) {
      console.error('Failed to send cancellation notification:', notificationError);
      // Don't fail the request if notification fails
    }

    return NextResponse.json({
      message: 'Appointment cancelled successfully',
      cancelledBy: {
        role: actorRoleDelete,
        name: actorNameDelete
      }
    });

  } catch (error) {
    console.error('Error cancelling appointment:', error);
    return NextResponse.json(
      { error: 'Failed to cancel appointment' },
      { status: 500 }
    );
  }
}
