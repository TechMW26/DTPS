import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import User from '@/lib/db/models/User';
import { deleteUserAvatarImageKitMedia } from '@/lib/client-media-cleanup';
import ClientMealPlan from '@/lib/db/models/ClientMealPlan';
import Appointment from '@/lib/db/models/Appointment';
import UnifiedPayment from '@/lib/db/models/UnifiedPayment';
import Task from '@/lib/db/models/Task';
import mongoose from 'mongoose';
import { AppointmentStatus, UserRole, PaymentStatus } from '@/types';
import { computeClientStatusFromDocs } from '@/lib/status/computeClientStatus';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

const STAFF_ROLES = [UserRole.DIETITIAN, UserRole.HEALTH_COUNSELOR] as const;

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function resolveStaffByIdentifier(identifier: string) {
  const normalized = decodeURIComponent(identifier || '').trim();
  if (!normalized) return null;

  // 1) Direct Mongo ObjectId
  if (mongoose.Types.ObjectId.isValid(normalized)) {
    const byObjectId = await User.findById(normalized).select('-password');
    if (byObjectId) return byObjectId;
  }

  // 2) Display IDs like Dt-ABCD / HC-ABCD (prefix of ObjectId)
  const displayIdMatch = normalized.match(/^(?:Dt|HC)-([A-Za-z0-9]{2,24})$/i);
  if (displayIdMatch) {
    const objectIdPrefix = escapeRegex(displayIdMatch[1].toLowerCase());
    const byDisplayId = await User.findOne({
      role: { $in: STAFF_ROLES },
      $expr: {
        $regexMatch: {
          input: { $toString: '$_id' },
          regex: `^${objectIdPrefix}`,
          options: 'i'
        }
      }
    }).select('-password');

    if (byDisplayId) return byDisplayId;
  }

  // 3) Fallback: allow email based lookup
  if (normalized.includes('@')) {
    const byEmail = await User.findOne({
      email: normalized.toLowerCase(),
      role: { $in: STAFF_ROLES }
    }).select('-password');

    if (byEmail) return byEmail;
  }

  return null;
}

// Get the ClientNote model dynamically
const getClientNoteModel = (): mongoose.Model<any> => {
  if (mongoose.models.ClientNote) {
    return mongoose.models.ClientNote;
  }

  const noteSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true },
    category: { type: String, default: 'general' },
    priority: { type: String, default: 'normal' },
    isEscalation: { type: Boolean, default: false },
    attachments: [{ name: String, url: String, type: String }],
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  });

  return mongoose.model('ClientNote', noteSchema);
};

// GET /api/admin/dietitians/[dietitianId] - Get full dietitian details with client progress
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ dietitianId: string }> }
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
    const { dietitianId } = await params;

    const dietitian = await withCache(
      `admin:dietitians:resolved:${JSON.stringify(dietitianId)}`,
      async () => await resolveStaffByIdentifier(dietitianId),
      { ttl: 120000, tags: ['admin'] }
    );

    if (!dietitian) {
      return NextResponse.json({ error: 'Dietitian not found' }, { status: 404 });
    }

    const resolvedDietitianId = dietitian._id.toString();

    // Allow both dietitian and health_counselor roles (case-insensitive check)
    const dietitianRole = dietitian.role?.toLowerCase();
    if (dietitianRole !== 'dietitian' && dietitianRole !== 'health_counselor') {
      return NextResponse.json({ error: 'User is not a dietitian or health counselor' }, { status: 400 });
    }

    // Get assigned clients with their progress
    const assignedClients = await withCache(
      `admin:dietitians:dietitianId:${JSON.stringify({
        role: UserRole.CLIENT,
        $or: [
          { assignedDietitian: resolvedDietitianId },
          { assignedDietitians: resolvedDietitianId }
        ]
      })}`,
      async () => await User.find({
        role: UserRole.CLIENT,
        $or: [
          { assignedDietitian: resolvedDietitianId },
          { assignedDietitians: resolvedDietitianId }
        ]
      })
        .select('firstName lastName email avatar phone status clientStatus holdStatus createdAt weight height healthGoals generalGoal onboardingCompleted')
        .sort({ createdAt: -1 }),
      { ttl: 120000, tags: ['admin'] }
    );

    const assignedClientIds = assignedClients.map(c => c._id);

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
        // Get meal plan count
        const mealPlanCount = await ClientMealPlan.countDocuments({
          clientId: client._id,
          assignedBy: resolvedDietitianId
        });

        // Get latest meal plan
        const latestMealPlan = await withCache(
          `admin:dietitians:dietitianId:${JSON.stringify({
            clientId: client._id
          })}`,
          async () => await ClientMealPlan.findOne({
            clientId: client._id
          })
            .populate('templateId', 'name')
            .sort({ createdAt: -1 }),
          { ttl: 120000, tags: ['admin'] }
        );

        // Get appointment count
        const appointmentCount = await Appointment.countDocuments({
          client: client._id,
          dietitian: resolvedDietitianId
        });

        // Get upcoming appointment
        const upcomingAppointment = await withCache(
          `admin:dietitians:dietitianId:upcoming-appointment:${client._id}:${resolvedDietitianId}`,
          async () => await Appointment.findOne({
            client: client._id,
            dietitian: resolvedDietitianId,
            scheduledAt: { $gte: new Date() },
            status: AppointmentStatus.SCHEDULED
          }).sort({ scheduledAt: 1 }),
          { ttl: 120000, tags: ['admin'] }
        );

        const computedClientStatus = computeClientStatusFromDocs(
          paymentsByClient.get(String(client._id)) || [],
          !!client?.holdStatus?.isOnHold
        );

        return {
          ...client.toObject(),
          clientStatus: computedClientStatus,
          progress: {
            mealPlanCount,
            latestMealPlan: latestMealPlan ? {
              name: latestMealPlan.templateId?.name || 'Custom Plan',
              startDate: latestMealPlan.startDate,
              status: latestMealPlan.status
            } : null,
            appointmentCount,
            upcomingAppointment: upcomingAppointment ? {
              dateTime: upcomingAppointment.scheduledAt,
              type: upcomingAppointment.type
            } : null
          }
        };
      })
    );

    // Get statistics
    const totalClients = assignedClients.length;
    const activeClients = clientsWithProgress.filter(c => c.clientStatus === 'active').length;
    const totalAppointments = await Appointment.countDocuments({
      dietitian: resolvedDietitianId
    });
    const completedAppointments = await Appointment.countDocuments({
      dietitian: resolvedDietitianId,
      status: AppointmentStatus.COMPLETED
    });
    const totalMealPlans = await ClientMealPlan.countDocuments({
      assignedBy: resolvedDietitianId
    });

    // Get recent appointments (last 30 + upcoming)
    const appointments = await Appointment.find({
      dietitian: resolvedDietitianId
    })
      .populate('client', 'firstName lastName email avatar')
      .sort({ scheduledAt: -1 })
      .limit(50);

    // Get payments associated with this dietitian
    const payments = await UnifiedPayment.find({
      dietitian: resolvedDietitianId
    })
      .populate('client', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .limit(50);

    // Get notes created by this dietitian
    const ClientNote = getClientNoteModel();
    const notes = await ClientNote.find({
      createdBy: resolvedDietitianId
    })
      .populate('userId', 'firstName lastName email avatar')
      .sort({ createdAt: -1 })
      .limit(50);

    // Get tasks assigned by/to this dietitian
    const tasks = await Task.find({
      $or: [
        { dietitian: resolvedDietitianId },
        { assignedBy: resolvedDietitianId }
      ]
    })
      .populate('client', 'firstName lastName email avatar')
      .sort({ startDate: -1 })
      .limit(50);

    // Get all meal plans created by this dietitian
    const mealPlans = await ClientMealPlan.find({
      assignedBy: resolvedDietitianId
    })
      .populate('clientId', 'firstName lastName email avatar')
      .populate('templateId', 'name')
      .sort({ createdAt: -1 })
      .limit(50);

    // Calculate payment stats
    const paymentStats = {
      totalPayments: payments.length,
      completedPayments: payments.filter(p => p.status === PaymentStatus.COMPLETED).length,
      pendingPayments: payments.filter(p => p.status === PaymentStatus.PENDING).length,
      totalRevenue: payments
        .filter(p => p.status === PaymentStatus.COMPLETED)
        .reduce((sum, p) => sum + (p.amount || 0), 0)
    };

    // Calculate task stats
    const taskStats = {
      totalTasks: tasks.length,
      completedTasks: tasks.filter(t => t.status === 'completed').length,
      pendingTasks: tasks.filter(t => t.status === 'pending').length,
      overdueTasks: tasks.filter(t =>
        t.status !== 'completed' && t.endDate && new Date(t.endDate) < new Date()
      ).length
    };

    return NextResponse.json({
      dietitian,
      clients: clientsWithProgress,
      appointments,
      payments,
      notes,
      tasks,
      mealPlans,
      stats: {
        totalClients,
        activeClients,
        totalAppointments,
        completedAppointments,
        totalMealPlans,
        ...paymentStats,
        ...taskStats
      }
    });

  } catch (error) {
    console.error('Error fetching dietitian details:', error);
    return NextResponse.json({ error: 'Failed to fetch dietitian details' }, { status: 500 });
  }
}

// PUT /api/admin/dietitians/[dietitianId] - Update dietitian details
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ dietitianId: string }> }
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
    const { dietitianId } = await params;
    const body = await request.json();

    const existingDietitian = await resolveStaffByIdentifier(dietitianId);
    if (!existingDietitian) {
      return NextResponse.json({ error: 'Dietitian not found' }, { status: 404 });
    }

    // Remove fields that shouldn't be updated directly
    const { password, _id, role, ...updateData } = body;

    const dietitian = await User.findByIdAndUpdate(
      existingDietitian._id,
      { $set: updateData },
      { new: true }
    ).select('-password');

    if (!dietitian) {
      return NextResponse.json({ error: 'Dietitian not found' }, { status: 404 });
    }

    return NextResponse.json({ dietitian, message: 'Dietitian updated successfully' });

  } catch (error) {
    console.error('Error updating dietitian:', error);
    return NextResponse.json({ error: 'Failed to update dietitian' }, { status: 500 });
  }
}

// DELETE /api/admin/dietitians/[dietitianId] - Delete or deactivate dietitian
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ dietitianId: string }> }
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
    const { dietitianId } = await params;
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'deactivate';

    const existingDietitian = await resolveStaffByIdentifier(dietitianId);
    if (!existingDietitian) {
      return NextResponse.json({ error: 'Dietitian not found' }, { status: 404 });
    }
    const resolvedDietitianId = existingDietitian._id.toString();

    // Check if dietitian has assigned clients
    const assignedClientsCount = await User.countDocuments({
      role: UserRole.CLIENT,
      $or: [
        { assignedDietitian: resolvedDietitianId },
        { assignedDietitians: resolvedDietitianId }
      ]
    });

    if (action === 'delete') {
      if (assignedClientsCount > 0) {
        return NextResponse.json({
          error: 'Cannot delete dietitian with assigned clients. Please reassign clients first.',
          assignedClientsCount
        }, { status: 400 });
      }
      await deleteUserAvatarImageKitMedia(existingDietitian as any);
      await User.findByIdAndDelete(resolvedDietitianId);
      return NextResponse.json({ message: 'Dietitian deleted permanently' });
    } else {
      const dietitian = await User.findByIdAndUpdate(
        resolvedDietitianId,
        { status: 'inactive' },
        { new: true }
      ).select('-password');

      if (!dietitian) {
        return NextResponse.json({ error: 'Dietitian not found' }, { status: 404 });
      }

      return NextResponse.json({
        dietitian,
        message: 'Dietitian deactivated successfully',
        warning: assignedClientsCount > 0 ? `This dietitian has ${assignedClientsCount} assigned clients` : null
      });
    }

  } catch (error) {
    console.error('Error deleting/deactivating dietitian:', error);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}
