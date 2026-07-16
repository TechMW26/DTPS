import { NextRequest, NextResponse } from 'next/server';
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
import { withCache, clearCacheByTag } from '@/lib/api/utils';

// GET /api/dashboard/dietitian-stats - Get real dashboard statistics
export async function GET(request: NextRequest) {
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
    let clientQuery: any   = { role: 'client' };
    let appointmentQuery: any = {};

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

    // ─── Status helpers ────────────────────────────────────────────────────────
    const buildStatusQuery = (status: string) => ({ ...clientQuery, clientStatus: status });

    const leadStatusOr = [
      { clientStatus: 'lead' },
      { clientStatus: { $exists: false } },
      { clientStatus: null },
    ];
    const leadQuery = clientQuery.$or
      ? { role: 'client', $and: [{ $or: clientQuery.$or }, { $or: leadStatusOr }] }
      : { ...clientQuery, $or: leadStatusOr };

    const holdStatusOr = [
      { clientStatus: 'hold' },
      { 'holdStatus.isOnHold': true },
    ];
    const holdQuery = clientQuery.$or
      ? { role: 'client', $and: [{ $or: clientQuery.$or }, { $or: holdStatusOr }] }
      : { ...clientQuery, $or: holdStatusOr };

    // ─── Concurrent DB queries ────────────────────────────────────────────────
    const [
      totalClients,
      activeClients,
      leadClients,
      inactiveClients,
      holdClients,
      totalAppointments,
      todaysAppointments,
      confirmedAppointments,
      pendingAppointments,
      completedSessions,
      totalPastAppointments,
      assignedClients,
      todaysSchedule,
    ] = await Promise.all([
      User.countDocuments(clientQuery),
      User.countDocuments(buildStatusQuery('active')),
      User.countDocuments(leadQuery),
      User.countDocuments(buildStatusQuery('inactive')),
      User.countDocuments(holdQuery),

      // Upcoming appointments (not cancelled)
      Appointment.countDocuments({
        ...appointmentQuery,
        scheduledAt: { $gte: startOfToday },
        status:      { $ne: 'cancelled' },
      }),

      // Today's appointments (any status)
      Appointment.countDocuments({
        ...appointmentQuery,
        scheduledAt: { $gte: startOfToday, $lt: endOfToday },
      }),

      // Confirmed/scheduled today
      Appointment.countDocuments({
        ...appointmentQuery,
        scheduledAt: { $gte: startOfToday, $lt: endOfToday },
        status:      { $in: ['confirmed', 'scheduled'] },
      }),

      // Pending today
      Appointment.countDocuments({
        ...appointmentQuery,
        scheduledAt: { $gte: startOfToday, $lt: endOfToday },
        status:      'pending',
      }),

      // Completed sessions (past)
      Appointment.countDocuments({
        ...appointmentQuery,
        scheduledAt: { $lt: startOfToday },
        status:      { $in: ['confirmed', 'completed'] },
      }),

      // Total past appointments (for completion rate)
      Appointment.countDocuments({
        ...appointmentQuery,
        scheduledAt: { $lt: startOfToday },
      }),

      // Assigned clients (for celebrations / identifiers)
      withCache(
        `dashboard:dietitian-stats:assigned-clients:${JSON.stringify(clientQuery)}`,
        async () =>
          User.find({ ...clientQuery })
            .sort({ createdAt: -1 })
            .select('firstName lastName email phone dateOfBirth anniversary createdAt'),
        { ttl: 120000, tags: ['dashboard'] }
      ),

      // Today's schedule
      withCache(
        `dashboard:dietitian-stats:schedule-${startOfToday.toISOString()}`,
        async () =>
          Appointment.find({
            ...appointmentQuery,
            scheduledAt: { $gte: startOfToday, $lt: endOfToday },
          })
            .populate('client', 'firstName lastName email')
            .sort({ scheduledAt: 1 }),
        { ttl: 120000, tags: ['dashboard'] }
      ),
    ]);

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

    // ─── Expiring meal plans (ClientMealPlan) – today through +3 days ─────────
    const expiringMealPlans =
      clientIds.length > 0
        ? await withCache(
            `dashboard:dietitian-stats:expiring-meal-plans-${startOfToday.toISOString()}`,
            async () =>
              ClientMealPlan.find({
                clientId: { $in: clientIds },
                status:   'active',
                // Inclusive: today 00:00 → exclusive: today+4 00:00
                endDate:  { $gte: startOfToday, $lt: endOfPendingWindow },
              })
                .populate('clientId', 'firstName lastName email phone avatar')
                .sort({ endDate: 1 }),
            { ttl: 60000, tags: ['dashboard'] }
          )
        : [];

    // ─── FIX: Expired meal plans (UnifiedPayment) – last 3 days through today ──
    // UnifiedPayment uses "client" (not "clientId") for the client reference.
    // Query: expectedEndDate >= (today - 3 days) AND expectedEndDate < midnight tomorrow
    // This captures plans that expired on:
    //   today-3, today-2, today-1  → already expired
    //   today                      → expires today
    const expiredMealPlans =
      clientIds.length > 0
        ? await withCache(
            `dashboard:dietitian-stats:expired-meal-plans-v2-${startOfToday.toISOString()}-${startOfExpiredWindow.toISOString()}`,
            async () =>
              UnifiedPayment.find({
                client: { $in: clientIds },          // ← correct field name (matches recentPayments query)
                expectedEndDate: {
                  $gte: startOfExpiredWindow,        // today - 3 days (inclusive)
                  $lt:  endOfToday,                  // midnight tonight (exclusive) → captures all of "today"
                },
              })
                .populate({
                  path:   'client',                  // ← correct field name
                  select: 'firstName lastName clientId email phone avatar',
                })
                .select('_id client expectedEndDate')
                .sort({ expectedEndDate: -1 }),      // most recently expired first
            { ttl: 60000, tags: ['dashboard'] }
          )
        : [];

    // ─── Clients with active meal plans ───────────────────────────────────────
    const clientsWithMealPlans =
      clientIds.length > 0
        ? await ClientMealPlan.distinct('clientId', {
            clientId: { $in: clientIds },
            status:   'active',
          }).then((ids) => ids.length)
        : 0;

    // ─── Completion rate ───────────────────────────────────────────────────────
    const completionRate =
      totalPastAppointments > 0
        ? Math.round((completedSessions / totalPastAppointments) * 100)
        : 0;

    // ─── Payments ─────────────────────────────────────────────────────────────
    let paymentQuery: any = {};
    if (
      session.user.role === UserRole.DIETITIAN ||
      session.user.role === UserRole.HEALTH_COUNSELOR
    ) {
      paymentQuery = clientIds.length > 0
        ? { client: { $in: clientIds } }
        : { _id: null };
    }

    const [recentPayments, totalRevenueResult, pendingPaymentsCount, completedPaymentsCount] =
      await Promise.all([
        withCache(
          `dashboard:dietitian-stats:payments-${JSON.stringify(paymentQuery)}`,
          async () =>
            UnifiedPayment.find(paymentQuery)
              .populate('client', 'firstName lastName email phone')
              .sort({ createdAt: -1 })
              .limit(10),
          { ttl: 120000, tags: ['dashboard'] }
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
          { ttl: 120000, tags: ['dashboard'] }
        ),
        UnifiedPayment.countDocuments({ ...paymentQuery, status: 'pending'   }),
        UnifiedPayment.countDocuments({ ...paymentQuery, status: 'completed' }),
      ]);

    // ─── Today's tasks ────────────────────────────────────────────────────────
    const todaysTasks = await withCache(
      `dashboard:dietitian-stats:tasks-${startOfToday.toISOString()}`,
      async () =>
        Task.find(
          session.user.role === UserRole.ADMIN
            ? {
                startDate: { $lte: endOfToday   },
                endDate:   { $gte: startOfToday  },
                status:    { $ne: 'cancelled'    },
              }
            : {
                dietitian: new mongoose.Types.ObjectId(session.user.id),
                startDate: { $lte: endOfToday   },
                endDate:   { $gte: startOfToday  },
                status:    { $ne: 'cancelled'    },
              }
        )
          .populate('client', 'firstName lastName email phone avatar')
          .sort({ startDate: 1, createdAt: -1 })
          .limit(10),
      { ttl: 120000, tags: ['dashboard'] }
    );

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