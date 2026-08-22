import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import User from '@/lib/db/models/User';
import Appointment from '@/lib/db/models/Appointment';
import UnifiedPayment from '@/lib/db/models/UnifiedPayment';
import ClientMealPlan from '@/lib/db/models/ClientMealPlan';
import Task from '@/lib/db/models/Task';
import { UserRole } from '@/types';
import mongoose from 'mongoose';
import { withCache } from '@/lib/api/utils';

// GET /api/dashboard/dietitian-stats - Get real dashboard statistics
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only allow dietitians, health counselors, and admins
    if (
      session.user.role !== UserRole.DIETITIAN &&
      session.user.role !== UserRole.HEALTH_COUNSELOR &&
      session.user.role !== UserRole.ADMIN
    ) {
      return NextResponse.json(
        { error: 'Forbidden - Dietitian or Health Counselor access required' },
        { status: 403 }
      );
    }

    await connectDB();

    // ─── Date boundaries ───────────────────────────────────────────────────────
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const startOfToday = new Date(today);

    const endOfToday = new Date(today);
    endOfToday.setDate(endOfToday.getDate() + 1); // midnight tomorrow (exclusive upper bound)

    // "Pending Soon" window  → today through next 3 calendar days (4 days inclusive)
    // Exclusive upper bound = midnight of day +4
    const PENDING_WINDOW_DAYS = 3;
    const endOfPendingWindow = new Date(today);
    endOfPendingWindow.setDate(endOfPendingWindow.getDate() + PENDING_WINDOW_DAYS + 1);

    // FIX: "Expired" window → last 3 calendar days through end of today
    // i.e. plans whose expectedEndDate is between (today - 3 days) and (end of today)
    const EXPIRED_LOOKBACK_DAYS = 3;
    const startOfExpiredWindow = new Date(today);
    startOfExpiredWindow.setDate(startOfExpiredWindow.getDate() - EXPIRED_LOOKBACK_DAYS);
    // endOfToday is already midnight tomorrow, so we use it as the exclusive upper bound
    // This means we capture plans that ended on: today-3, today-2, today-1, or today

    const todayMonth = today.getMonth();
    const todayDate  = today.getDate();

    // ─── Role-based query scoping ──────────────────────────────────────────────
    const clientQuery: any = { role: 'client' };
    const appointmentQuery: any = {};

    if (
      session.user.role === UserRole.DIETITIAN ||
      session.user.role === UserRole.HEALTH_COUNSELOR
    ) {
      const staffObjectId = new mongoose.Types.ObjectId(session.user.id);
      const orConditions: any[] = [
        { assignedDietitian:  staffObjectId },
        { assignedDietitians: staffObjectId },
        { 'createdBy.userId': staffObjectId },
      ];
      if (session.user.role === UserRole.HEALTH_COUNSELOR) {
        orConditions.push(
          { assignedHealthCounselor:  staffObjectId },
          { assignedHealthCounselors: staffObjectId }
        );
      }
      clientQuery.$or      = orConditions;
      appointmentQuery.dietitian = staffObjectId;
    }

    // Read assigned clients once and derive all five status counters from that
    // result. The previous implementation ran five additional scans over the
    // same user scope before loading the same clients again.
    const [assignedClients, appointmentMetricRows, todaysSchedule] = await Promise.all([
      withCache(
        `dashboard:dietitian-stats:assigned-clients:${JSON.stringify(clientQuery)}`,
        async () =>
          User.find({ ...clientQuery })
            .sort({ createdAt: -1 })
            .select(
              'firstName lastName email phone dateOfBirth anniversary createdAt clientStatus holdStatus.isOnHold',
            )
            .lean(),
        { ttl: 120000, tags: ['dashboard'] }
      ),
      // One conditional aggregation replaces six independent appointment
      // counts over the same role-scoped collection.
      Appointment.aggregate([
        { $match: appointmentQuery },
        {
          $group: {
            _id: null,
            totalAppointments: {
              $sum: {
                $cond: [
                  { $and: [{ $gte: ['$scheduledAt', startOfToday] }, { $ne: ['$status', 'cancelled'] }] },
                  1,
                  0,
                ],
              },
            },
            todaysAppointments: {
              $sum: {
                $cond: [
                  { $and: [{ $gte: ['$scheduledAt', startOfToday] }, { $lt: ['$scheduledAt', endOfToday] }] },
                  1,
                  0,
                ],
              },
            },
            confirmedAppointments: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $gte: ['$scheduledAt', startOfToday] },
                      { $lt: ['$scheduledAt', endOfToday] },
                      { $in: ['$status', ['confirmed', 'scheduled']] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            pendingAppointments: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $gte: ['$scheduledAt', startOfToday] },
                      { $lt: ['$scheduledAt', endOfToday] },
                      { $eq: ['$status', 'pending'] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            completedSessions: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $lt: ['$scheduledAt', startOfToday] },
                      { $in: ['$status', ['confirmed', 'completed']] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            totalPastAppointments: {
              $sum: { $cond: [{ $lt: ['$scheduledAt', startOfToday] }, 1, 0] },
            },
          },
        },
      ]),
      withCache(
        `dashboard:dietitian-stats:schedule-${startOfToday.toISOString()}`,
        async () =>
          Appointment.find({
            ...appointmentQuery,
            scheduledAt: { $gte: startOfToday, $lt: endOfToday },
          })
            .populate('client', 'firstName lastName email')
            .sort({ scheduledAt: 1 })
            .lean(),
        { ttl: 120000, tags: ['dashboard'] }
      ),
    ]);

    const totalClients = assignedClients.length;
    const activeClients = assignedClients.filter((client: any) => client.clientStatus === 'active').length;
    const leadClients = assignedClients.filter(
      (client: any) => !client.clientStatus || client.clientStatus === 'lead',
    ).length;
    const inactiveClients = assignedClients.filter(
      (client: any) => client.clientStatus === 'inactive',
    ).length;
    const holdClients = assignedClients.filter(
      (client: any) => client.clientStatus === 'hold' || client.holdStatus?.isOnHold === true,
    ).length;
    const appointmentMetrics = appointmentMetricRows[0] || {};
    const totalAppointments = appointmentMetrics.totalAppointments || 0;
    const todaysAppointments = appointmentMetrics.todaysAppointments || 0;
    const confirmedAppointments = appointmentMetrics.confirmedAppointments || 0;
    const pendingAppointments = appointmentMetrics.pendingAppointments || 0;
    const completedSessions = appointmentMetrics.completedSessions || 0;
    const totalPastAppointments = appointmentMetrics.totalPastAppointments || 0;

    // ─── Celebrations ─────────────────────────────────────────────────────────
    const isTodayMonthDay = (value?: Date | string | null) => {
      if (!value) return false;
      const d = new Date(value);
      return d.getMonth() === todayMonth && d.getDate() === todayDate;
    };

    const recentClients = assignedClients
      .filter(
        (c: any) =>
          c.createdAt &&
          new Date(c.createdAt) >= startOfToday &&
          new Date(c.createdAt) < endOfToday
      )
      .slice(0, 10);

    const todayCelebrations = assignedClients
      .flatMap((client: any) => {
        const out: Array<{
          id: string;
          clientId: string;
          clientName: string;
          clientEmail?: string;
          clientPhone?: string;
          type: 'Birthday' | 'Anniversary';
          date: string | Date;
        }> = [];

        if (isTodayMonthDay(client.dateOfBirth)) {
          out.push({
            id:          `${client._id}-birthday`,
            clientId:    client._id,
            clientName:  `${client.firstName} ${client.lastName}`,
            clientEmail: client.email,
            clientPhone: client.phone,
            type:        'Birthday',
            date:        client.dateOfBirth,
          });
        }

        if (isTodayMonthDay(client.anniversary)) {
          out.push({
            id:          `${client._id}-anniversary`,
            clientId:    client._id,
            clientName:  `${client.firstName} ${client.lastName}`,
            clientEmail: client.email,
            clientPhone: client.phone,
            type:        'Anniversary',
            date:        client.anniversary,
          });
        }

        return out;
      })
      .slice(0, 10);

    // ─── Client IDs for meal-plan / payment queries ────────────────────────────
    const clientIds = assignedClients.map((c: any) => c._id);

    // All remaining queries depend only on the client IDs and can run in one
    // wave. Previously they were split into four sequential network waits.
    let paymentQuery: any = {};
    if (
      session.user.role === UserRole.DIETITIAN ||
      session.user.role === UserRole.HEALTH_COUNSELOR
    ) {
      paymentQuery = clientIds.length > 0
        ? { client: { $in: clientIds } }
        : { _id: null };
    }

    const [
      expiringMealPlans,
      expiredMealPlans,
      activeMealPlanClientIds,
      recentPayments,
      totalRevenueResult,
      pendingPaymentsCount,
      completedPaymentsCount,
      todaysTasks,
    ] = await Promise.all([
      clientIds.length > 0
        ? withCache(
            `dashboard:dietitian-stats:expiring-meal-plans-${startOfToday.toISOString()}`,
            async () =>
              ClientMealPlan.find({
                clientId: { $in: clientIds },
                status: 'active',
                endDate: { $gte: startOfToday, $lt: endOfPendingWindow },
              })
                .select('_id clientId name startDate endDate status')
                .populate('clientId', 'firstName lastName email phone avatar')
                .sort({ endDate: 1 })
                .lean(),
            { ttl: 60000, tags: ['dashboard'] },
          )
        : Promise.resolve([]),
      clientIds.length > 0
        ? withCache(
            `dashboard:dietitian-stats:expired-meal-plans-v2-${startOfToday.toISOString()}-${startOfExpiredWindow.toISOString()}`,
            async () =>
              UnifiedPayment.find({
                client: { $in: clientIds },
                expectedEndDate: { $gte: startOfExpiredWindow, $lt: endOfToday },
              })
                .populate({
                  path: 'client',
                  select: 'firstName lastName clientId email phone avatar',
                })
                .select('_id client expectedEndDate')
                .sort({ expectedEndDate: -1 })
                .lean(),
            { ttl: 60000, tags: ['dashboard'] },
          )
        : Promise.resolve([]),
      clientIds.length > 0
        ? ClientMealPlan.distinct('clientId', {
            clientId: { $in: clientIds },
            status: 'active',
          })
        : Promise.resolve([]),
      withCache(
        `dashboard:dietitian-stats:payments-${JSON.stringify(paymentQuery)}`,
        async () =>
          UnifiedPayment.find(paymentQuery)
            .select(
              'client amount currency status planName planCategory durationDays durationLabel transactionId createdAt',
            )
            .populate('client', 'firstName lastName email phone')
            .sort({ createdAt: -1 })
            .limit(10)
            .lean(),
        { ttl: 120000, tags: ['dashboard'] },
      ),
      withCache(
        `dashboard:dietitian-stats:revenue-${JSON.stringify(paymentQuery)}`,
        async () =>
          UnifiedPayment.aggregate([
            {
              $match: {
                ...paymentQuery,
                status: { $in: ['completed', 'pending', 'paid'] },
              },
            },
            { $group: { _id: null, total: { $sum: '$amount' } } },
          ]),
        { ttl: 120000, tags: ['dashboard'] },
      ),
      UnifiedPayment.countDocuments({ ...paymentQuery, status: 'pending' }),
      UnifiedPayment.countDocuments({ ...paymentQuery, status: 'completed' }),
      withCache(
        `dashboard:dietitian-stats:tasks-${startOfToday.toISOString()}`,
        async () =>
          Task.find(
            session.user.role === UserRole.ADMIN
              ? {
                  startDate: { $lte: endOfToday },
                  endDate: { $gte: startOfToday },
                  status: { $ne: 'cancelled' },
                }
              : {
                  dietitian: new mongoose.Types.ObjectId(session.user.id),
                  startDate: { $lte: endOfToday },
                  endDate: { $gte: startOfToday },
                  status: { $ne: 'cancelled' },
                },
          )
            .select(
              'client title taskType allottedTime status startDate endDate createdAt',
            )
            .populate('client', 'firstName lastName email phone avatar')
            .sort({ startDate: 1, createdAt: -1 })
            .limit(10)
            .lean(),
        { ttl: 120000, tags: ['dashboard'] },
      ),
    ]);

    const clientsWithMealPlans = activeMealPlanClientIds.length;
    const completionRate =
      totalPastAppointments > 0
        ? Math.round((completedSessions / totalPastAppointments) * 100)
        : 0;

    /*
      Queries above intentionally remain fresh because this dashboard includes
      appointments, messages and payments. `withCache` currently acts only as
      request de-duplication compatibility and does not serve stale data.
    */

    const totalRevenue    = totalRevenueResult[0]?.total || 0;
    const activePercentage =
      totalClients > 0 ? Math.round((activeClients / totalClients) * 100) : 0;

    // ─── Helper: calendar days remaining from today (positive = future) ───────
    // Returns 0 if endDate is today, 1 if tomorrow, -1 if yesterday, etc.
    const daysRemainingFromToday = (endDate: Date | string): number => {
      const d = new Date(endDate);
      d.setHours(0, 0, 0, 0);
      return Math.ceil((d.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24));
    };

    // ─── Helper: calendar days since expiry (positive = already expired) ──────
    // Returns 0 if expectedEndDate is today, 1 if yesterday, 2 if 2 days ago, etc.
    const expiredDaysFromToday = (endDate: Date | string): number => {
      const d = new Date(endDate);
      d.setHours(0, 0, 0, 0);
      return Math.round((startOfToday.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    };

    // ─── Build response ───────────────────────────────────────────────────────
    return NextResponse.json({
      totalClients,
      activeClients,
      leadClients,
      inactiveClients,
      holdClients,
      clientsWithMealPlans,
      totalAppointments,
      todaysAppointments,
      confirmedAppointments,
      pendingAppointments,
      completedSessions,
      completionRate,
      activePercentage,

      recentClients: recentClients.map((client: any) => ({
        id:         client._id,
        name:       `${client.firstName} ${client.lastName}`,
        email:      client.email,
        phone:      client.phone,
        joinedDate: client.createdAt,
      })),

      todayCelebrations: todayCelebrations.map((c) => ({ ...c })),

      // Meal plans expiring today or in the next 3 days
      expiringMealPlans: expiringMealPlans.map((plan: any) => ({
        id:           plan._id,
        clientId:     plan.clientId?._id || plan.clientId,
        clientName:   plan.clientId
          ? `${plan.clientId.firstName} ${plan.clientId.lastName}`
          : 'Unknown Client',
        clientEmail:  plan.clientId?.email,
        clientPhone:  plan.clientId?.phone,
        mealPlanName: plan.name,
        endDate:      plan.endDate,
        startDate:    plan.startDate,
        status:       plan.status,
        daysRemaining: daysRemainingFromToday(plan.endDate),
      })),

      // FIX: Meal plans (from UnifiedPayment) that expired in the last 3 days OR today
      // NOTE: UnifiedPayment stores client ref as "client" field, not "clientId"
      expiredMealPlans: expiredMealPlans.map((plan: any) => {
        const days = expiredDaysFromToday(plan.expectedEndDate);
        // days = 0  → expires/expired today
        // days > 0  → already expired N days ago
        // days < 0  → should not happen given our query, but handle defensively
        return {
          id:           plan._id,
          clientId:     plan.client?._id   || plan.client,   // ← "client" field
          clientName:   plan.client
            ? `${plan.client.firstName} ${plan.client.lastName}`
            : 'Unknown Client',
          clientCode:   plan.client?.clientId,
          clientEmail:  plan.client?.email,
          clientPhone:  plan.client?.phone,
          clientAvatar: plan.client?.avatar,
          paymentId:    plan._id,
          expectedEndDate: plan.expectedEndDate,

          // Positive = days since expiry (0 = today)
          expiredDays: days,

          // Convenience flags
          isExpired:    days > 0,   // already in the past
          expiresToday: days === 0, // ends today
          upcoming:     days < 0,   // safety net; should never be true given the query

          // Human-readable label
          expiryStatus:
            days > 0
              ? `Expired ${days} day${days === 1 ? '' : 's'} ago`
              : days === 0
              ? 'Expires Today'
              : `Expires in ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'}`,
        };
      }),

      todayTasks: todaysTasks.map((task: any) => ({
        id:           task._id,
        clientId:     task.client?._id,
        clientName:   task.client
          ? `${task.client.firstName} ${task.client.lastName}`
          : 'Unknown Client',
        clientEmail:  task.client?.email,
        clientPhone:  task.client?.phone,
        title:        task.title || task.taskType,
        taskType:     task.taskType,
        allottedTime: task.allottedTime,
        status:       task.status,
        startDate:    task.startDate,
        endDate:      task.endDate,
      })),

      todaysSchedule: todaysSchedule.map((appt: any) => ({
        id: appt._id,
        time: new Date(appt.scheduledAt).toLocaleTimeString('en-US', {
          hour:   'numeric',
          minute: '2-digit',
          hour12: true,
        }),
        clientName: appt.client
          ? `${appt.client.firstName} ${appt.client.lastName}`
          : 'Unknown Client',
        clientEmail: appt.client?.email,
        status:      appt.status,
        type:        appt.type || 'Consultation',
      })),

      totalRevenue,
      pendingPaymentsCount,
      completedPaymentsCount,
      recentPayments: recentPayments.map((payment: any) => ({
        id:          payment._id,
        clientName:  payment.client
          ? `${payment.client.firstName} ${payment.client.lastName}`
          : 'Unknown Client',
        clientEmail:   payment.client?.email,
        clientPhone:   payment.client?.phone,
        amount:        payment.amount,
        currency:      payment.currency || 'INR',
        status:        payment.status,
        planName:      payment.planName      || 'N/A',
        planCategory:  payment.planCategory,
        durationDays:  payment.durationDays,
        durationLabel: payment.durationLabel,
        transactionId: payment.transactionId,
        createdAt:     payment.createdAt,
      })),
    });
  } catch (error) {
    console.error('Error fetching dietitian stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dashboard statistics' },
      { status: 500 }
    );
  }
}
