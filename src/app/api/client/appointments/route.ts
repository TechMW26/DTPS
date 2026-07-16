import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import connectDB from '@/lib/db/connection';
import Appointment from '@/lib/db/models/Appointment';
import User from '@/lib/db/models/User';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

// GET /api/client/appointments - Get appointments for current client user
export async function GET(request: NextRequest) {
  try {
    // Run auth + DB connection in PARALLEL
    const [session] = await Promise.all([
      getServerSession(authOptions),
      connectDB()
    ]);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '50');
    const page = parseInt(searchParams.get('page') || '1');

    // Build query for client's appointments
    let query: any = {
      client: session.user.id
    };

    // Add status filter
    if (status) {
      query.status = status;
    }

    const appointments = await withCache(
      `client-appointments:${session.user.id}:${status || 'all'}:p${page}:l${limit}`,
      async () => await Appointment.find(query)
      .populate('dietitian', 'firstName lastName email avatar')
      .populate('client', 'firstName lastName email avatar')
      .populate('createdBy', 'firstName lastName role')
      .select('+lifecycleHistory +cancelledBy +rescheduledBy')
      .sort({ scheduledAt: -1 })
      .limit(limit)
      .skip((page - 1) * limit)
      .lean(),
      { ttl: 60000, tags: ['client'] }
    );

    const total = await Appointment.countDocuments(query);

    // Transform appointments to match frontend interface
    const transformedAppointments = appointments.map((apt: any) => ({
      id: apt._id.toString(),
      dietitianId: apt.dietitian?._id?.toString() || '',
      dietitianName: apt.dietitian ? `${apt.dietitian.firstName || ''} ${apt.dietitian.lastName || ''}`.trim() : 'Unknown Dietitian',
      dietitianImage: apt.dietitian?.avatar,
      date: apt.scheduledAt,
      time: new Date(apt.scheduledAt).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      }),
      duration: apt.duration || 30,
      type: apt.type === 'video_consultation' ? 'video' : apt.type === 'consultation' ? 'audio' : apt.type,
      status: getAppointmentStatus(apt),
      notes: apt.notes,
      meetingLink: apt.meetingLink,
      zoomMeetingId: apt.zoomMeetingId,
      zoomJoinUrl: apt.zoomJoinUrl,
      // Audit fields
      lifecycleHistory: apt.lifecycleHistory || [],
      cancelledBy: apt.cancelledBy,
      rescheduledBy: apt.rescheduledBy
    }));

    return NextResponse.json(transformedAppointments);

  } catch (error) {
    console.error('Error fetching client appointments:', error);
    return NextResponse.json(
      { error: 'Failed to fetch appointments' },
      { status: 500 }
    );
  }
}

// Helper function to determine appointment status
function getAppointmentStatus(appointment: any): 'upcoming' | 'completed' | 'cancelled' | 'rescheduled' {
  if (appointment.status === 'cancelled') return 'cancelled';
  if (appointment.status === 'rescheduled') return 'rescheduled';
  if (appointment.status === 'completed') return 'completed';
  
  const now = new Date();
  const scheduledAt = new Date(appointment.scheduledAt);
  const endTime = new Date(scheduledAt.getTime() + (appointment.duration || 30) * 60000);
  
  if (now > endTime) return 'completed';
  return 'upcoming';
}

// POST /api/client/appointments - Create/Book a new appointment
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const data = await request.json();
    const { dietitianId, scheduledAt, duration = 30, type = 'video_consultation', notes } = data;

    if (!dietitianId || !scheduledAt) {
      return NextResponse.json(
        { error: 'Dietitian ID and scheduled time are required' },
        { status: 400 }
      );
    }

    // Verify the dietitian exists and is assigned to this client
    const client = await withCache(
      `client:appointments:${JSON.stringify(session.user.id)}`,
      async () => await User.findById(session.user.id).select('assignedDietitian assignedDietitians'),
      { ttl: 60000, tags: ['client'] }
    );
    const assignedDietitians = [
      client?.assignedDietitian?.toString(),
      ...(client?.assignedDietitians?.map((d: any) => d.toString()) || [])
    ].filter(Boolean);

    if (!assignedDietitians.includes(dietitianId)) {
      return NextResponse.json(
        { error: 'You can only book appointments with your assigned dietitian' },
        { status: 403 }
      );
    }

    // Create the appointment
    const appointment = new Appointment({
      client: session.user.id,
      dietitian: dietitianId,
      scheduledAt: new Date(scheduledAt),
      duration,
      type,
      notes,
      status: 'scheduled',
      createdBy: session.user.id
    }) as any;

    await appointment.save();

    // Populate dietitian info for response
    const populatedAppointment: any = await appointment.populate('dietitian', 'firstName lastName email avatar');

    return NextResponse.json({
      success: true,
      appointment: {
        id: populatedAppointment._id.toString(),
        dietitianId: populatedAppointment.dietitian?._id?.toString() || '',
        dietitianName: populatedAppointment.dietitian 
          ? `${populatedAppointment.dietitian.firstName || ''} ${populatedAppointment.dietitian.lastName || ''}`.trim() 
          : 'Unknown Dietitian',
        date: populatedAppointment.scheduledAt,
        time: new Date(populatedAppointment.scheduledAt).toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        }),
        duration: populatedAppointment.duration,
        type: populatedAppointment.type === 'video_consultation' ? 'video' : populatedAppointment.type,
        status: 'upcoming',
        notes: populatedAppointment.notes
      }
    });

  } catch (error) {
    console.error('Error creating appointment:', error);
    return NextResponse.json(
      { error: 'Failed to create appointment' },
      { status: 500 }
    );
  }
}
