import { getServerSession } from 'next-auth';
import mongoose from 'mongoose';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import Appointment from '@/lib/db/models/Appointment';
import ClientMealPlan from '@/lib/db/models/ClientMealPlan';
import UnifiedPayment from '@/lib/db/models/UnifiedPayment';
import User from '@/lib/db/models/User';
import { UserRole } from '@/types';

export async function GET() {
  try {
    const [session] = await Promise.all([
      getServerSession(authOptions),
      connectDB(),
    ]);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (
      session.user.role !== UserRole.HEALTH_COUNSELOR &&
      session.user.role !== UserRole.ADMIN
    ) {
      return NextResponse.json(
        { error: 'Forbidden - Health Counselor access required' },
        { status: 403 },
      );
    }

    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    const clientQuery: Record<string, unknown> = { role: UserRole.CLIENT };
    const appointmentQuery: Record<string, unknown> = {};

    if (session.user.role === UserRole.HEALTH_COUNSELOR) {
      const counselorId = new mongoose.Types.ObjectId(session.user.id);
      clientQuery.$or = [
        { assignedHealthCounselor: counselorId },
        { assignedHealthCounselors: counselorId },
        { 'createdBy.userId': counselorId },
      ];
      appointmentQuery.$or = [
        { dietitian: counselorId },
        { healthCounselor: counselorId },
      ];
    }

    // One client read supplies IDs, status counts and the recent-client list.
    // One appointment aggregation supplies all five counters.
    const [assignedClients, appointmentRows, todaysSchedule] = await Promise.all([
      User.find(clientQuery)
        .select('firstName lastName email phone avatar clientStatus createdAt')
        .sort({ createdAt: -1 })
        .lean(),
      Appointment.aggregate([
        { $match: appointmentQuery },
        {
          $group: {
            _id: null,
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
      Appointment.find({
        ...appointmentQuery,
        scheduledAt: { $gte: startOfToday, $lt: endOfToday },
      })
        .select('client scheduledAt duration status')
        .populate('client', 'firstName lastName email avatar')
        .sort({ scheduledAt: 1 })
        .lean(),
    ]);

    const clientIds = assignedClients.map((client: any) => client._id);
    const paymentQuery =
      session.user.role === UserRole.HEALTH_COUNSELOR
        ? clientIds.length > 0
          ? { client: { $in: clientIds } }
          : { _id: null }
        : {};

    const [activePlanClientIds, paymentRows] = await Promise.all([
      clientIds.length > 0
        ? ClientMealPlan.distinct('clientId', {
            clientId: { $in: clientIds },
            status: 'active',
          })
        : Promise.resolve([]),
      UnifiedPayment.aggregate([
        { $match: paymentQuery },
        {
          $group: {
            _id: null,
            totalRevenue: {
              $sum: {
                $cond: [{ $eq: ['$status', 'completed'] }, { $ifNull: ['$amount', 0] }, 0],
              },
            },
            pendingPaymentsCount: {
              $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] },
            },
            completedPaymentsCount: {
              $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
            },
          },
        },
      ]),
    ]);

    const metrics = appointmentRows[0] || {};
    const paymentMetrics = paymentRows[0] || {};
    const totalClients = assignedClients.length;
    const activeClients = assignedClients.filter(
      (client: any) => client.clientStatus === 'active',
    ).length;
    const leadClients = assignedClients.filter(
      (client: any) => !client.clientStatus || client.clientStatus === 'lead',
    ).length;
    const inactiveClients = assignedClients.filter(
      (client: any) => client.clientStatus === 'inactive',
    ).length;
    const totalPastAppointments = metrics.totalPastAppointments || 0;
    const completedSessions = metrics.completedSessions || 0;

    return NextResponse.json({
      totalClients,
      activeClients,
      leadClients,
      inactiveClients,
      clientsWithMealPlans: activePlanClientIds.length,
      todaysAppointments: metrics.todaysAppointments || 0,
      confirmedAppointments: metrics.confirmedAppointments || 0,
      pendingAppointments: metrics.pendingAppointments || 0,
      completedSessions,
      completionRate:
        totalPastAppointments > 0
          ? Math.round((completedSessions / totalPastAppointments) * 100)
          : 0,
      activePercentage:
        totalClients > 0 ? Math.round((activeClients / totalClients) * 100) : 0,
      recentClients: assignedClients.slice(0, 10).map((client: any) => ({
        _id: client._id,
        firstName: client.firstName,
        lastName: client.lastName,
        email: client.email,
        phone: client.phone,
        avatar: client.avatar,
        clientStatus: client.clientStatus,
        createdAt: client.createdAt,
      })),
      todaysSchedule: todaysSchedule.map((appointment: any) => ({
        _id: appointment._id,
        client: appointment.client
          ? {
              _id: appointment.client._id,
              firstName: appointment.client.firstName,
              lastName: appointment.client.lastName,
              avatar: appointment.client.avatar,
            }
          : null,
        scheduledAt: appointment.scheduledAt,
        duration: appointment.duration,
        status: appointment.status,
      })),
      totalRevenue: paymentMetrics.totalRevenue || 0,
      pendingPaymentsCount: paymentMetrics.pendingPaymentsCount || 0,
      completedPaymentsCount: paymentMetrics.completedPaymentsCount || 0,
    });
  } catch (error) {
    console.error('Error fetching health counselor stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dashboard statistics' },
      { status: 500 },
    );
  }
}
