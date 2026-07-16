import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import User from '@/lib/db/models/User';
import Appointment from '@/lib/db/models/Appointment';
import UnifiedPayment from '@/lib/db/models/UnifiedPayment';
import { computeClientStatusFromDocs } from '@/lib/status/computeClientStatus';
import { AppointmentStatus, UserRole } from '@/types';

// GET /api/admin/health-counselors/[counselorId] - Get full health counselor details with client progress
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ counselorId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userRole = session.user.role?.toLowerCase();
    if (!userRole || !userRole.includes('admin')) {
      return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
    }

    await connectDB();
    const { counselorId } = await params;

    const counselor = await User.findById(counselorId)
      .select('-password');

    if (!counselor) {
      return NextResponse.json({ error: 'Health Counselor not found' }, { status: 404 });
    }

    if (counselor.role !== UserRole.HEALTH_COUNSELOR) {
      return NextResponse.json({ error: 'User is not a health counselor' }, { status: 400 });
    }

    // Get assigned clients with their progress
    const assignedClients = await User.find({
      role: UserRole.CLIENT,
      $or: [
        { assignedHealthCounselor: counselorId },
        { assignedHealthCounselors: counselorId }
      ]
    })
      .select('firstName lastName email avatar phone status clientStatus holdStatus createdAt weight height healthGoals generalGoal onboardingCompleted')
      .sort({ createdAt: -1 });

    const assignedClientIds = assignedClients.map(c => c._id);

    // Compute client status from successful payments + hold state for accurate
    // Lead/Active/Inactive/Hold display in admin views.
    const paymentDocs = await UnifiedPayment.find(
      {
        client: { $in: assignedClientIds },
        $or: [{ status: { $in: ['paid', 'completed', 'active'] } }, { paymentStatus: 'paid' }],
      },
      { client: 1, status: 1, paymentStatus: 1, expectedEndDate: 1, endDate: 1 }
    ).lean();

    const paymentsByClient = new Map<string, any[]>();
    paymentDocs.forEach((payment: any) => {
      const key = String(payment.client);
      if (!paymentsByClient.has(key)) paymentsByClient.set(key, []);
      paymentsByClient.get(key)!.push(payment);
    });

    // Get client progress stats
    const clientsWithProgress = await Promise.all(
      assignedClients.map(async (client) => {
        // Get appointment count
        const appointmentCount = await Appointment.countDocuments({
          client: client._id
        });

        // Get upcoming appointment
        const upcomingAppointment = await Appointment.findOne({
          client: client._id,
          scheduledAt: { $gte: new Date() },
          status: AppointmentStatus.SCHEDULED
        }).sort({ scheduledAt: 1 });

        // Get last appointment
        const lastAppointment = await Appointment.findOne({
          client: client._id,
          status: AppointmentStatus.COMPLETED
        }).sort({ scheduledAt: -1 });

        const computedClientStatus = computeClientStatusFromDocs(
          paymentsByClient.get(String(client._id)) || [],
          !!client?.holdStatus?.isOnHold
        );

        return {
          ...client.toObject(),
          clientStatus: computedClientStatus,
          progress: {
            appointmentCount,
            upcomingAppointment: upcomingAppointment ? {
              dateTime: upcomingAppointment.scheduledAt,
              type: upcomingAppointment.type
            } : null,
            lastAppointment: lastAppointment ? {
              dateTime: lastAppointment.scheduledAt,
              type: lastAppointment.type
            } : null
          }
        };
      })
    );

    // Get statistics
    const totalClients = assignedClients.length;
    const activeClients = clientsWithProgress.filter(c => c.clientStatus === 'active').length;

    const totalAppointments = await Appointment.countDocuments({
      client: { $in: assignedClientIds }
    });

    const completedAppointments = await Appointment.countDocuments({
      client: { $in: assignedClientIds },
      status: AppointmentStatus.COMPLETED
    });

    return NextResponse.json({
      counselor,
      clients: clientsWithProgress,
      stats: {
        totalClients,
        activeClients,
        totalAppointments,
        completedAppointments
      }
    });

  } catch (error) {
    console.error('Error fetching health counselor details:', error);
    return NextResponse.json({ error: 'Failed to fetch health counselor details' }, { status: 500 });
  }
}

// PUT /api/admin/health-counselors/[counselorId] - Update health counselor details
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ counselorId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userRole = session.user.role?.toLowerCase();
    if (!userRole || !userRole.includes('admin')) {
      return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
    }

    await connectDB();
    const { counselorId } = await params;
    const body = await request.json();

    // Remove fields that shouldn't be updated directly
    const { password, _id, role, ...updateData } = body;

    const counselor = await User.findByIdAndUpdate(
      counselorId,
      { $set: updateData },
      { new: true }
    ).select('-password');

    if (!counselor) {
      return NextResponse.json({ error: 'Health Counselor not found' }, { status: 404 });
    }

    return NextResponse.json({ counselor, message: 'Health Counselor updated successfully' });

  } catch (error) {
    console.error('Error updating health counselor:', error);
    return NextResponse.json({ error: 'Failed to update health counselor' }, { status: 500 });
  }
}

// DELETE /api/admin/health-counselors/[counselorId] - Delete or deactivate health counselor
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ counselorId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userRole = session.user.role?.toLowerCase();
    if (!userRole || !userRole.includes('admin')) {
      return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
    }

    await connectDB();
    const { counselorId } = await params;
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'deactivate';

    // Check if counselor has assigned clients
    const assignedClientsCount = await User.countDocuments({
      role: UserRole.CLIENT,
      $or: [
        { assignedHealthCounselor: counselorId },
        { assignedHealthCounselors: counselorId }
      ]
    });

    if (action === 'delete') {
      if (assignedClientsCount > 0) {
        return NextResponse.json({
          error: 'Cannot delete health counselor with assigned clients. Please reassign clients first.',
          assignedClientsCount
        }, { status: 400 });
      }
      await User.findByIdAndDelete(counselorId);
      return NextResponse.json({ message: 'Health Counselor deleted permanently' });
    } else {
      const counselor = await User.findByIdAndUpdate(
        counselorId,
        { status: 'inactive' },
        { new: true }
      ).select('-password');

      if (!counselor) {
        return NextResponse.json({ error: 'Health Counselor not found' }, { status: 404 });
      }

      return NextResponse.json({
        counselor,
        message: 'Health Counselor deactivated successfully',
        warning: assignedClientsCount > 0 ? `This health counselor has ${assignedClientsCount} assigned clients` : null
      });
    }

  } catch (error) {
    console.error('Error deleting/deactivating health counselor:', error);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}
