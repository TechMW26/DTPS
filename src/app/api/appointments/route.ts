import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import Appointment from '@/lib/db/models/Appointment';
import User from '@/lib/db/models/User';
import { AppointmentType, AppointmentMode } from '@/lib/db/models/AppointmentConfig';
import { syncAppointmentToCalendars } from '@/lib/services/googleCalendar';
import { UserRole, AppointmentStatus, AppointmentActorRole } from '@/types';
import { logHistoryServer } from '@/lib/server/history';
import { logActivity, logApiError } from '@/lib/utils/activityLogger';
import { socketManager } from '@/lib/realtime/socket-manager';
import { sendNotificationToUser } from '@/lib/firebase/firebaseNotification';
import { withCache, clearCacheByTag } from '@/lib/api/utils';
import mongoose from 'mongoose';
import { generateMeetingLink, requiresMeetingLink } from '@/lib/services/meetingLink';
import { sendAppointmentConfirmationEmail, AppointmentEmailData } from '@/lib/services/appointmentEmail';

// Lean result type for User fields used in access checks
interface LeanClientDoc {
  _id: unknown;
  role?: string;
  assignedDietitian?: unknown;
  assignedDietitians?: unknown[];
  assignedHealthCounselor?: unknown;
}

// GET /api/appointments - Get appointments for current user
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const date = searchParams.get('date');
    const search = searchParams.get('search');
    const dietitianId = searchParams.get('dietitianId');
    const clientId = searchParams.get('clientId');
    const limit = parseInt(searchParams.get('limit') || '10');
    const page = parseInt(searchParams.get('page') || '1');

    // Build query based on user role
    let query: any = {};

    // If specific clientId is requested (client panel view), enforce access and scope to that client
    if (clientId) {
      const requestedClientRaw = await User.findById(clientId).select(
        '_id role assignedDietitian assignedDietitians assignedHealthCounselor'
      ).lean();
      if (!requestedClientRaw) {
        return NextResponse.json({ error: 'Client not found' }, { status: 404 });
      }

      // Cast the lean result to a typed object for safe property access
      const clientDoc = requestedClientRaw as LeanClientDoc;
      const role = session.user.role;
      const requesterId = String(session.user.id);

      if (role === UserRole.CLIENT) {
        if (requesterId !== String(clientId)) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
      } else if (role === UserRole.DIETITIAN) {
        const assignedDietitian = clientDoc.assignedDietitian?.toString();
        const assignedDietitiansRaw = clientDoc.assignedDietitians;
        const assignedDietitians = Array.isArray(assignedDietitiansRaw)
          ? assignedDietitiansRaw.map(String)
          : [];
        const inAssignedList = assignedDietitians.includes(requesterId);
        if (assignedDietitian !== requesterId && !inAssignedList) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
      } else if (role === UserRole.HEALTH_COUNSELOR) {
        const assignedHC = clientDoc.assignedHealthCounselor?.toString();
        if (assignedHC !== requesterId) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
      } else {
        // admin: allowed
      }
      query.client = clientId;
      if (dietitianId) query.dietitian = dietitianId;
    } else if (dietitianId) {
      // If specific dietitianId is requested (for slots view)
      query.dietitian = dietitianId;
    } else if (session.user.role === UserRole.DIETITIAN) {
      // Get all clients assigned to this dietitian
      const userObjectId = new mongoose.Types.ObjectId(session.user.id);
      const assignedClients = await User.find({
        role: UserRole.CLIENT,
        $or: [
          { assignedDietitian: userObjectId },
          { assignedDietitians: userObjectId }
        ]
      }).select('_id').lean();
      const assignedClientIds = assignedClients.map(c => c._id);

      // Dietitian can see appointments they created OR for their assigned clients
      query.$or = [
        { dietitian: session.user.id },
        { client: { $in: assignedClientIds } }
      ];
    } else if (session.user.role === UserRole.HEALTH_COUNSELOR) {
      // Get all clients assigned to this health counselor
      const userObjectId = new mongoose.Types.ObjectId(session.user.id);
      const assignedClients = await User.find({
        role: UserRole.CLIENT,
        assignedHealthCounselor: userObjectId
      }).select('_id').lean();
      const assignedClientIds = assignedClients.map(c => c._id);

      // Health counselor can see appointments for their assigned clients
      if (assignedClientIds.length > 0) {
        query.client = { $in: assignedClientIds };
      } else {
        // No assigned clients, show empty result
        query.client = null;
      }
    } else if (session.user.role === UserRole.CLIENT) {
      query.client = session.user.id;
    } else {
      // Admin can see all appointments
    }

    // Add filters
    if (status) {
      query.status = status;
    }

    if (date) {
      const startDate = new Date(date);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 1);
      query.scheduledAt = {
        $gte: startDate,
        $lt: endDate
      };
    }

    // Add search functionality
    if (search) {
      const searchRegex = { $regex: search, $options: 'i' };
      query.$or = [
        { type: searchRegex },
        { notes: searchRegex }
      ];
    }

    // By default, only show current and future appointments
    // If includeAll=true is passed (for specific client panel), show all including past
    const includeAll = searchParams.get('includeAll') === 'true';
    if (!includeAll && !date) {
      // Only show appointments from start of today onwards
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      query.scheduledAt = { ...query.scheduledAt, $gte: todayStart };
    }

    // Generate cache key based on user and query params
    const cacheKey = `appointments:${session.user.id}:${session.user.role}:${clientId || ''}:${status || ''}:${date || ''}:${search || ''}:${dietitianId || ''}:${page}:${limit}:${includeAll}`;

    const { appointments, total } = await withCache(
      cacheKey,
      async () => {
        const appointments = await Appointment.find(query)
          .populate('dietitian', 'firstName lastName email avatar')
          .populate('client', 'firstName lastName email avatar')
          .populate('createdBy', 'firstName lastName role')
          .populate('appointmentTypeId', 'name slug color icon')
          .populate('appointmentModeId', 'name slug icon')
          .select('+lifecycleHistory +cancelledBy +rescheduledBy')
          .sort({ scheduledAt: 1 })
          .limit(limit)
          .skip((page - 1) * limit)
          .lean();

        const total = await Appointment.countDocuments(query);
        return { appointments, total };
      },
      { ttl: 60000, tags: ['appointments'] } // 1 minute TTL
    );

    return NextResponse.json({
      appointments,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Error fetching appointments:', error);
    return NextResponse.json(
      { error: 'Failed to fetch appointments' },
      { status: 500 }
    );
  }
}

// POST /api/appointments - Create new appointment
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    let {
      dietitianId,
      clientId,
      scheduledAt,
      duration,
      type,
      notes,
      appointmentTypeId,
      appointmentModeId,
      modeName,
      location
    } = body;

    console.log('[Appointment POST] Request body:', JSON.stringify({
      dietitianId, clientId, scheduledAt, duration, type,
      appointmentTypeId, appointmentModeId, modeName, location
    }, null, 2));

    await connectDB();

    // Validate required fields
    if (!dietitianId || !clientId || !scheduledAt) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Get the client to check assignment
    const client = await User.findById(clientId);
    if (!client) {
      return NextResponse.json(
        { error: 'Client not found' },
        { status: 404 }
      );
    }

    const currentUserId = session.user.id?.toString();

    // ====== STRICT ROLE-BASED VALIDATION ======

    // For Dietitians: can only book for clients assigned to them
    if (session.user.role === UserRole.DIETITIAN) {
      const assignedDietitianId = client.assignedDietitian?.toString();
      const assignedDietitians = Array.isArray(client.assignedDietitians)
        ? client.assignedDietitians.map((d: any) => d.toString())
        : [];

      const isAssigned = assignedDietitianId === currentUserId ||
        assignedDietitians.includes(currentUserId);

      if (!isAssigned) {
        return NextResponse.json(
          { error: 'You can only book appointments for clients assigned to you' },
          { status: 403 }
        );
      }

      // Dietitians can only book appointments where they are the provider
      if (dietitianId !== currentUserId) {
        return NextResponse.json(
          { error: 'You can only create appointments as yourself' },
          { status: 403 }
        );
      }
    }

    // For Health Counselors: can only book for clients assigned to them
    if (session.user.role === UserRole.HEALTH_COUNSELOR) {
      const assignedHCId = client.assignedHealthCounselor?.toString();

      // Allow booking if HC is assigned to this client
      // If no HC is assigned yet, auto-assign this HC to the client
      if (!assignedHCId) {
        // Auto-assign this HC to the client
        client.assignedHealthCounselor = session.user.id;
        await client.save();
        console.log('Auto-assigned HC to client:', currentUserId);
      } else if (assignedHCId !== currentUserId) {
        console.log('HC booking denied - assignedHC:', assignedHCId, 'currentUser:', currentUserId);
        return NextResponse.json(
          { error: 'You can only book appointments with clients assigned to you' },
          { status: 403 }
        );
      }

      // Health counselors can only book appointments where they are the provider
      if (dietitianId !== currentUserId) {
        return NextResponse.json(
          { error: 'You can only create appointments as yourself' },
          { status: 403 }
        );
      }
    }

    // For Clients: they cannot create appointments via this API
    if (session.user.role === UserRole.CLIENT) {
      return NextResponse.json(
        { error: 'Clients cannot create appointments directly' },
        { status: 403 }
      );
    }

    // Admin: no restrictions on client/provider selection

    // Map common type values to valid enum values
    const typeMapping: { [key: string]: string } = {
      'video': 'video_consultation',
      'phone': 'consultation',
      'in-person': 'consultation',
      'follow-up': 'follow_up',
      'followup': 'follow_up',
      'initial-consultation': 'initial_consultation',
      'initial_consultation': 'initial_consultation',
      'nutrition-assessment': 'nutrition_assessment',
      'nutrition_assessment': 'nutrition_assessment',
      'group-session': 'group_session',
      'group_session': 'group_session',
      'video-consultation': 'video_consultation',
      'video_consultation': 'video_consultation',
    };

    // Valid appointment types from the enum
    const validTypes = [
      'consultation',
      'follow_up',
      'follow-up',
      'group_session',
      'video_consultation',
      'initial_consultation',
      'nutrition_assessment'
    ];

    // If type is provided and needs mapping, map it
    if (type && typeMapping[type.toLowerCase()]) {
      type = typeMapping[type.toLowerCase()];
    }

    // Default to consultation if no type provided or invalid type
    if (!type || !validTypes.includes(type)) {
      type = 'consultation';
    }

    // Check for scheduling conflicts
    const conflicts = await Appointment.findConflicts(
      dietitianId,
      new Date(scheduledAt),
      duration || 60
    );

    if (conflicts.length > 0) {
      return NextResponse.json(
        { error: 'Time slot conflicts with existing appointment' },
        { status: 409 }
      );
    }

    // Get dietitian details for meeting link generation (client already fetched above)
    const dietitian = await User.findById(dietitianId);

    if (!dietitian || !client) {
      return NextResponse.json(
        { error: 'Dietitian or client not found' },
        { status: 404 }
      );
    }

    // Get appointment type and mode details for meeting link generation and emails
    let appointmentTypeName = type;
    let appointmentModeName = modeName || '';
    let appointmentDuration = typeof duration === 'number' ? duration : parseInt(duration) || 60;

    if (appointmentTypeId) {
      const appointmentTypeDoc = await AppointmentType.findById(appointmentTypeId);
      if (appointmentTypeDoc) {
        appointmentTypeName = appointmentTypeDoc.name;
        appointmentDuration = appointmentTypeDoc.duration || appointmentDuration;
      }
    }

    if (appointmentModeId) {
      const appointmentModeDoc = await AppointmentMode.findById(appointmentModeId);
      if (appointmentModeDoc) {
        appointmentModeName = appointmentModeDoc.name;
      }
    }

    // Validate duration is within acceptable range
    if (appointmentDuration < 15 || appointmentDuration > 180) {
      appointmentDuration = 60; // Default to 60 minutes if out of range
    }

    // Determine actor role for lifecycle tracking
    const getActorRole = (role: string): AppointmentActorRole => {
      if (role === UserRole.ADMIN || role === 'admin') return 'admin';
      if (role === UserRole.DIETITIAN || role === 'dietitian') return 'dietitian';
      if (role === UserRole.HEALTH_COUNSELOR || role === 'health_counselor') return 'health_counselor';
      return 'client';
    };

    // Ensure we have a valid user ID for lifecycle tracking
    const performerUserId = session.user.id;
    if (!performerUserId) {
      return NextResponse.json(
        { error: 'Invalid session - missing user ID' },
        { status: 401 }
      );
    }

    console.log('[Appointment POST] Creating appointment with:', {
      dietitian: dietitianId,
      client: clientId,
      scheduledAt: new Date(scheduledAt),
      duration: appointmentDuration,
      type,
      performerUserId
    });

    // Create appointment with lifecycle tracking
    const appointment = new Appointment({
      dietitian: dietitianId,
      client: clientId,
      scheduledAt: new Date(scheduledAt),
      duration: appointmentDuration,
      type,
      notes,
      status: AppointmentStatus.SCHEDULED,
      createdBy: performerUserId,
      // New unified booking fields
      appointmentTypeId: appointmentTypeId || undefined,
      appointmentModeId: appointmentModeId || undefined,
      modeName: appointmentModeName || undefined,
      location: location || undefined,
      // Lifecycle tracking
      lifecycleHistory: [{
        action: 'created',
        performedBy: performerUserId,
        performedByRole: getActorRole(session.user.role as string),
        performedByName: session.user.name || `${dietitian.firstName} ${dietitian.lastName}`,
        timestamp: new Date(),
        details: { scheduledAt: new Date(scheduledAt).toISOString(), duration: appointmentDuration }
      }],
    }) as any;

    // Generate meeting link if the appointment mode requires it
    let generatedMeetingLink: string | undefined;

    console.log('[Appointment POST] Checking meeting link requirement for mode:', appointmentModeName);

    if (appointmentModeName && requiresMeetingLink(appointmentModeName)) {
      console.log('[Appointment POST] Mode requires meeting link, generating...');
      try {
        const meetingTopic = `${appointmentTypeName || 'Consultation'} - ${client.firstName} ${client.lastName}`;
        const meetingResult = await generateMeetingLink(appointmentModeName, {
          topic: meetingTopic,
          scheduledAt: new Date(scheduledAt),
          duration: appointmentDuration,
          description: notes || `Appointment: ${appointmentTypeName || 'Consultation'}`,
          hostEmail: dietitian.email,
          attendees: [
            { email: dietitian.email, name: `${dietitian.firstName} ${dietitian.lastName}` },
            { email: client.email, name: `${client.firstName} ${client.lastName}` }
          ]
        });

        console.log('[Appointment POST] Meeting link result:', {
          success: meetingResult.success,
          meetingLink: meetingResult.meetingLink,
          provider: meetingResult.meetingDetails?.provider,
          error: meetingResult.error
        });

        if (meetingResult.success && meetingResult.meetingLink) {
          generatedMeetingLink = meetingResult.meetingLink;
          appointment.meetingLink = meetingResult.meetingLink;

          if (meetingResult.meetingDetails) {
            appointment.meetingProvider = meetingResult.meetingDetails.provider;
          }
          console.log('[Appointment POST] Meeting link saved to appointment:', generatedMeetingLink);
        } else if (!meetingResult.success) {
          console.warn('[Appointment POST] Failed to generate meeting link:', meetingResult.error);
        }
      } catch (meetingError) {
        console.error('[Appointment POST] Failed to generate meeting link:', meetingError);
        // Continue without meeting link - don't fail the appointment creation
      }
    } else {
      console.log('[Appointment POST] Mode does not require meeting link');
    }

    try {
      console.log('[Appointment POST] Saving appointment...');
      await appointment.save();
      console.log('[Appointment POST] Appointment saved successfully:', appointment._id);
    } catch (saveError: any) {
      console.error('[Appointment POST] Failed to save appointment:', saveError);
      console.error('[Appointment POST] Validation errors:', saveError?.errors);
      return NextResponse.json(
        { error: saveError?.message || 'Failed to save appointment', validationErrors: saveError?.errors },
        { status: 400 }
      );
    }

    // Clear appointments cache after creation
    clearCacheByTag('appointments');

    // Populate the created appointment
    await appointment.populate('dietitian', 'firstName lastName email avatar');
    await appointment.populate('client', 'firstName lastName email avatar');

    // Send appointment confirmation emails
    try {
      const providerRole: 'dietitian' | 'health_counselor' =
        (session.user.role as string) === UserRole.HEALTH_COUNSELOR || (session.user.role as string) === 'health_counselor'
          ? 'health_counselor'
          : 'dietitian';

      const emailData: AppointmentEmailData = {
        appointmentId: appointment._id.toString(),
        clientName: `${client.firstName} ${client.lastName}`,
        clientEmail: client.email,
        providerName: `${dietitian.firstName} ${dietitian.lastName}`,
        providerEmail: dietitian.email,
        providerRole,
        appointmentType: appointmentTypeName || type,
        appointmentMode: appointmentModeName || 'In-Person',
        scheduledAt: new Date(scheduledAt),
        duration: appointmentDuration,
        meetingLink: generatedMeetingLink || appointment.meetingLink,
        location: location,
        notes: notes,
      };

      const emailResult = await sendAppointmentConfirmationEmail(emailData);

      // Track email sent status in the appointment
      appointment.emailsSent = {
        confirmation: {
          sentAt: new Date(),
          success: emailResult.success,
          errors: emailResult.errors
        }
      };
      await appointment.save();

      if (!emailResult.success) {
        console.warn('Some appointment emails failed:', emailResult.errors);
      }
    } catch (emailError) {
      console.error('Failed to send appointment confirmation emails:', emailError);
      // Don't fail the appointment creation if emails fail
    }

    // Sync appointment to Google Calendar for both dietitian and client
    try {
      const appointmentCalendarData = {
        title: `${appointmentTypeName || 'Consultation'}: ${client.firstName} ${client.lastName} & ${dietitian.firstName} ${dietitian.lastName}`,
        description: notes || `Appointment: ${appointmentTypeName || 'Consultation'}`,
        scheduledAt: new Date(scheduledAt),
        duration: appointmentDuration,
        meetingLink: generatedMeetingLink || appointment.meetingLink
      };

      const calendarResult = await syncAppointmentToCalendars(
        dietitianId,
        clientId,
        appointmentCalendarData,
        dietitian.email,
        client.email
      );

      // Store Google Calendar event IDs
      if (calendarResult.dietitianEventId || calendarResult.clientEventId) {
        appointment.googleCalendarEventId = {
          dietitian: calendarResult.dietitianEventId,
          client: calendarResult.clientEventId
        };
        await appointment.save();
      }

      if (calendarResult.errors.length > 0) {
        console.warn('Google Calendar sync warnings:', calendarResult.errors);
      }
    } catch (calendarError) {
      console.error('Failed to sync appointment to Google Calendar:', calendarError);
      // Don't fail the appointment creation if calendar sync fails
    }

    // Record history for the client
    await logHistoryServer({
      userId: clientId,
      action: 'create',
      category: 'appointment',
      description: `Appointment scheduled with ${dietitian.firstName} ${dietitian.lastName} on ${new Date(scheduledAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`,
      performedById: session.user.id,
      metadata: {
        appointmentId: appointment._id,
        dietitianId,
        clientId,
        scheduledAt,
        duration: duration || 60,
        type,
        status: appointment.status,
      },
    });

    // Log activity
    await logActivity({
      userId: session.user.id,
      userRole: session.user.role as any,
      userName: session.user.name || 'Unknown',
      userEmail: session.user.email || '',
      action: 'Booked Appointment',
      actionType: 'create',
      category: 'appointment',
      description: `Booked appointment with ${dietitian.firstName} ${dietitian.lastName} for ${client.firstName} ${client.lastName} on ${new Date(scheduledAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}`,
      targetUserId: clientId,
      targetUserName: `${client.firstName} ${client.lastName}`,
      resourceId: appointment._id.toString(),
      resourceType: 'Appointment',
      details: { scheduledAt, duration: duration || 60, type }
    });

    // Send real-time notification to dietitian about new booking
    try {
      socketManager.sendToUser(dietitianId, 'appointment_booked', {
        appointmentId: appointment._id,
        client: {
          _id: client._id,
          firstName: client.firstName,
          lastName: client.lastName,
          avatar: client.avatar
        },
        scheduledAt: appointment.scheduledAt,
        duration: appointment.duration,
        type: appointment.type,
        timestamp: Date.now()
      });

      // Also notify the client if someone else booked for them
      if (session.user.id !== clientId) {
        socketManager.sendToUser(clientId, 'appointment_booked', {
          appointmentId: appointment._id,
          dietitian: {
            _id: dietitian._id,
            firstName: dietitian.firstName,
            lastName: dietitian.lastName,
            avatar: dietitian.avatar
          },
          scheduledAt: appointment.scheduledAt,
          duration: appointment.duration,
          type: appointment.type,
          timestamp: Date.now()
        });
      }
    } catch (sseError) {
      console.error('Failed to send SSE notification:', sseError);
      // Don't fail the request if SSE notification fails
    }

    // Send push notifications for the appointment
    try {
      const formattedDate = new Date(scheduledAt).toLocaleDateString('en-IN', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'Asia/Kolkata'
      });

      // Send push notification to dietitian
      await sendNotificationToUser(dietitianId, {
        title: '📅 New Appointment Booked',
        body: `${client.firstName} ${client.lastName} booked a ${type || 'consultation'} on ${formattedDate}`,
        icon: client.avatar || '/icons/icon-192x192.png',
        data: {
          type: 'appointment_booked',
          appointmentId: appointment._id.toString(),
          clientId,
        },
        clickAction: `/appointments`,
      });

      // Send push notification to client
      await sendNotificationToUser(clientId, {
        title: '📅 Appointment Confirmed',
        body: `Your ${type || 'consultation'} with ${dietitian.firstName} ${dietitian.lastName} is scheduled for ${formattedDate}`,
        icon: dietitian.avatar || '/icons/icon-192x192.png',
        data: {
          type: 'appointment_booked',
          appointmentId: appointment._id.toString(),
          dietitianId,
        },
        clickAction: `/user/appointments`,
      });
    } catch (pushError) {
      console.error('Failed to send appointment push notification:', pushError);
      // Don't fail the request if push notification fails
    }

    return NextResponse.json({ appointment }, { status: 201 });

  } catch (error: any) {
    console.error('Error creating appointment:', error);
    console.error('Error details:', {
      message: error?.message,
      stack: error?.stack,
      name: error?.name,
      code: error?.code
    });
    return NextResponse.json(
      { error: error?.message || 'Failed to create appointment' },
      { status: 500 }
    );
  }
}
