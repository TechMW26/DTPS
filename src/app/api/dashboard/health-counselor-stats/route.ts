import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import User from '@/lib/db/models/User';
import Appointment from '@/lib/db/models/Appointment';
import UnifiedPayment from '@/lib/db/models/UnifiedPayment';
import ClientMealPlan from '@/lib/db/models/ClientMealPlan';
import { UserRole } from '@/types';
import mongoose from 'mongoose';
import { withCache } from '@/lib/api/utils';

// GET /api/dashboard/health-counselor-stats - Get health counselor specific dashboard statistics
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only allow health counselors and admins to access this endpoint
    if (session.user.role !== UserRole.HEALTH_COUNSELOR &&
      session.user.role !== UserRole.ADMIN) {
      return NextResponse.json({ error: 'Forbidden - Health Counselor access required' }, { status: 403 });
    }

    // Connect to MongoDB
    await connectDB();

    // Get current date for today's calculations
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

    // Build query based on role - Health Counselors see only their assigned clients
    let clientQuery: any = { role: 'client' };
    let appointmentQuery: any = {};

    if (session.user.role === UserRole.HEALTH_COUNSELOR) {
      const healthCounselorObjectId = new mongoose.Types.ObjectId(session.user.id);
      // Health counselors see clients assigned specifically to them
      clientQuery.$or = [
        { assignedHealthCounselor: healthCounselorObjectId },
        { assignedHealthCounselors: healthCounselorObjectId },
        { 'createdBy.userId': healthCounselorObjectId }
      ];
      // Appointments where this health counselor is the dietitian (provider)
      appointmentQuery.$or = [
        { dietitian: healthCounselorObjectId },
        { healthCounselor: healthCounselorObjectId }
      ];
    }
    // Admin sees all clients (no filter needed)

    // Build status-based queries
    const buildStatusQuery = (status: string) => {
      return { ...clientQuery, clientStatus: status };
    };

    // Build lead query
    const leadStatusOr = [{ clientStatus: 'lead' }, { clientStatus: { $exists: false } }, { clientStatus: null }];
    const leadQuery = clientQuery.$or
      ? { role: 'client', $and: [{ $or: clientQuery.$or }, { $or: leadStatusOr }] }
      : { ...clientQuery, $or: leadStatusOr };

    // Run all independent queries concurrently
    const [
      totalClients,
      activeClients,
      leadClients,
      inactiveClients,
      todaysAppointments,
      confirmedAppointments,
      pendingAppointments,
      completedSessions,
      totalPastAppointments,
      recentClients,
      todaysSchedule
    ] = await Promise.all([
      // Total clients assigned to this health counselor
      User.countDocuments(clientQuery),
      // Active clients
      User.countDocuments(buildStatusQuery('active')),
      // Lead clients
      User.countDocuments(leadQuery),
      // Inactive clients
      User.countDocuments(buildStatusQuery('inactive')),
      // Today's appointments
      Appointment.countDocuments({
        ...appointmentQuery,
        scheduledAt: { $gte: startOfToday, $lt: endOfToday }
      }),
      // Confirmed appointments for today
      Appointment.countDocuments({
        ...appointmentQuery,
        scheduledAt: { $gte: startOfToday, $lt: endOfToday },
        status: { $in: ['confirmed', 'scheduled'] }
      }),
      // Pending appointments for today
      Appointment.countDocuments({
        ...appointmentQuery,
        scheduledAt: { $gte: startOfToday, $lt: endOfToday },
        status: 'pending'
      }),
      // Completed sessions
      Appointment.countDocuments({
        ...appointmentQuery,
        scheduledAt: { $lt: startOfToday },
        status: { $in: ['confirmed', 'completed'] }
      }),
      // Total past appointments
      Appointment.countDocuments({
        ...appointmentQuery,
        scheduledAt: { $lt: startOfToday }
      }),
      // Recent clients
      User.find(clientQuery)
        .sort({ createdAt: -1 })
        .limit(10)
        .select('firstName lastName email phone avatar clientStatus createdAt'),
      // Today's schedule
      Appointment.find({
        ...appointmentQuery,
        scheduledAt: { $gte: startOfToday, $lt: endOfToday }
      })
        .populate('client', 'firstName lastName email avatar')
        .sort({ scheduledAt: 1 })
    ]);

    // Get client IDs for meal plan and payment queries
    const clientIds = await User.find(clientQuery).distinct('_id');

    // Get clients with active meal plans
    const clientsWithMealPlans = clientIds.length > 0
      ? await ClientMealPlan.distinct('clientId', {
        clientId: { $in: clientIds },
        status: 'active'
      }).then(ids => ids.length)
      : 0;

    const completionRate = totalPastAppointments > 0
      ? Math.round((completedSessions / totalPastAppointments) * 100)
      : 0;

    // Get payments from assigned clients
    let paymentQuery: any = {};

    if (session.user.role === UserRole.HEALTH_COUNSELOR) {
      if (clientIds.length > 0) {
        paymentQuery = { client: { $in: clientIds } };
      } else {
        paymentQuery = { _id: null };
      }
    }

    // Run payment queries
    const [totalRevenueResult, pendingPaymentsCount, completedPaymentsCount] = await Promise.all([
      UnifiedPayment.aggregate([
        { $match: { ...paymentQuery, status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      UnifiedPayment.countDocuments({ ...paymentQuery, status: 'pending' }),
      UnifiedPayment.countDocuments({ ...paymentQuery, status: 'completed' })
    ]);

    const totalRevenue = totalRevenueResult[0]?.total || 0;

    // Calculate active percentage
    const activePercentage = totalClients > 0 ? Math.round((activeClients / totalClients) * 100) : 0;

    return NextResponse.json({
      totalClients,
      activeClients,
      leadClients,
      inactiveClients,
      clientsWithMealPlans,
      todaysAppointments,
      confirmedAppointments,
      pendingAppointments,
      completedSessions,
      completionRate,
      activePercentage,
      recentClients: recentClients.map(client => ({
        _id: client._id,
        firstName: client.firstName,
        lastName: client.lastName,
        email: client.email,
        phone: client.phone,
        avatar: client.avatar,
        clientStatus: client.clientStatus,
        createdAt: client.createdAt
      })),
      todaysSchedule: todaysSchedule.map(appointment => ({
        _id: (appointment as any)._id,
        client: (appointment as any).client ? {
          _id: (appointment as any).client._id,
          firstName: (appointment as any).client.firstName,
          lastName: (appointment as any).client.lastName,
          avatar: (appointment as any).client.avatar
        } : null,
        scheduledAt: (appointment as any).scheduledAt,
        duration: (appointment as any).duration,
        status: (appointment as any).status
      })),
      totalRevenue,
      pendingPaymentsCount,
      completedPaymentsCount
    });

  } catch (error) {
    console.error('Error fetching health counselor stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dashboard statistics' },
      { status: 500 }
    );
  }
}
