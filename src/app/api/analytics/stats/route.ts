import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import User from '@/lib/db/models/User';
import Appointment from '@/lib/db/models/Appointment';

type MonthlyRow = { _id: string; count?: number; revenue?: number };

// GET /api/analytics/stats - Get analytics without repeated collection scans.
export async function GET() {
  try {
    const [session] = await Promise.all([
      getServerSession(authOptions),
      connectDB(),
    ]);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const isAdmin = session.user.role === 'admin';
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const sixMonthStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const activeSince = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Two faceted aggregations replace the previous serial counts and twelve
    // per-month queries. They also use the canonical appointment timestamp.
    const [userRows, appointmentRows] = await Promise.all([
      User.aggregate([
        { $match: { role: 'client' } },
        {
          $facet: {
            summary: [
              {
                $group: {
                  _id: null,
                  totalClients: { $sum: 1 },
                  activeClients: {
                    $sum: {
                      $cond: [
                        {
                          $or: [
                            { $gt: ['$wooCommerceData.totalOrders', 0] },
                            { $gte: ['$lastLoginAt', activeSince] },
                            { $gte: ['$updatedAt', activeSince] },
                          ],
                        },
                        1,
                        0,
                      ],
                    },
                  },
                  repeatCustomers: {
                    $sum: { $cond: [{ $gt: ['$wooCommerceData.totalOrders', 1] }, 1, 0] },
                  },
                  totalRevenue: { $sum: { $ifNull: ['$wooCommerceData.totalSpent', 0] } },
                  totalOrders: { $sum: { $ifNull: ['$wooCommerceData.totalOrders', 0] } },
                  monthlyRevenue: {
                    $sum: {
                      $cond: [
                        {
                          $and: [
                            { $gte: ['$wooCommerceData.lastOrderDate', startOfMonth] },
                            { $lt: ['$wooCommerceData.lastOrderDate', nextMonthStart] },
                          ],
                        },
                        { $ifNull: ['$wooCommerceData.totalSpent', 0] },
                        0,
                      ],
                    },
                  },
                },
              },
            ],
            revenueByMonth: [
              {
                $match: {
                  'wooCommerceData.lastOrderDate': {
                    $gte: sixMonthStart,
                    $lt: nextMonthStart,
                  },
                },
              },
              {
                $group: {
                  _id: {
                    $dateToString: {
                      format: '%Y-%m',
                      date: '$wooCommerceData.lastOrderDate',
                      timezone: 'Asia/Kolkata',
                    },
                  },
                  revenue: { $sum: { $ifNull: ['$wooCommerceData.totalSpent', 0] } },
                },
              },
            ],
          },
        },
      ]),
      Appointment.aggregate([
        {
          $facet: {
            summary: [
              {
                $group: {
                  _id: null,
                  totalAppointments: { $sum: 1 },
                  completedAppointments: {
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
                },
              },
            ],
            appointmentsByMonth: [
              { $match: { scheduledAt: { $gte: sixMonthStart, $lt: nextMonthStart } } },
              {
                $group: {
                  _id: {
                    $dateToString: {
                      format: '%Y-%m',
                      date: '$scheduledAt',
                      timezone: 'Asia/Kolkata',
                    },
                  },
                  count: { $sum: 1 },
                },
              },
            ],
            appointmentTypes: [
              { $group: { _id: '$type', count: { $sum: 1 } } },
              { $sort: { count: -1 } },
            ],
          },
        },
      ]),
    ]);

    const userFacet = userRows[0] || {};
    const appointmentFacet = appointmentRows[0] || {};
    const userSummary = userFacet.summary?.[0] || {};
    const appointmentSummary = appointmentFacet.summary?.[0] || {};
    const totalClients = userSummary.totalClients || 0;
    const totalRevenue = userSummary.totalRevenue || 0;
    const totalOrders = userSummary.totalOrders || 0;
    const revenueByKey = new Map<string, number>(
      (userFacet.revenueByMonth || []).map((row: MonthlyRow) => [row._id, row.revenue || 0]),
    );
    const appointmentsByKey = new Map<string, number>(
      (appointmentFacet.appointmentsByMonth || []).map((row: MonthlyRow) => [row._id, row.count || 0]),
    );

    const appointmentsByMonth = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const appointments = appointmentsByKey.get(key) || 0;
      return {
        month: date.toLocaleDateString('en-IN', { month: 'short', timeZone: 'Asia/Kolkata' }),
        appointments,
        revenue: isAdmin ? appointments * 100 : 0,
      };
    });
    const revenueByMonth = appointmentsByMonth.map((month, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      return { month: month.month, revenue: revenueByKey.get(key) || 0 };
    });
    const processingRevenue = totalRevenue * 0.2;
    const completedRevenue = totalRevenue * 0.8;
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    const clientProgress = [
      { clientName: 'Sarah Wilson', weightLoss: 8.5, adherence: 92 },
      { clientName: 'Mike Johnson', weightLoss: 12.3, adherence: 88 },
      { clientName: 'Emma Davis', weightLoss: 6.7, adherence: 95 },
      { clientName: 'John Smith', weightLoss: 15.2, adherence: 85 },
      { clientName: 'Lisa Brown', weightLoss: 9.8, adherence: 90 },
    ];

    return NextResponse.json({
      totalClients,
      activeClients: userSummary.activeClients || 0,
      totalAppointments: appointmentSummary.totalAppointments || 0,
      completedAppointments: appointmentSummary.completedAppointments || 0,
      totalRevenue: isAdmin ? totalRevenue : 0,
      monthlyRevenue: isAdmin ? userSummary.monthlyRevenue || 0 : 0,
      avgSessionDuration: 45,
      clientRetentionRate:
        totalClients > 0
          ? Math.round(((userSummary.repeatCustomers || 0) / totalClients) * 100)
          : 0,
      appointmentsByMonth,
      clientProgress,
      appointmentTypes: (appointmentFacet.appointmentTypes || []).map(
        (type: { _id?: string; count: number }) => ({
          type: type._id || 'Consultation',
          count: type.count,
          revenue: isAdmin ? type.count * 100 : 0,
        }),
      ),
      revenueByMonth: isAdmin ? revenueByMonth : [],
      wooSummary: {
        totalClients,
        processingOrders: Math.floor(totalClients * 0.1),
        completedOrders: Math.floor(totalClients * 0.7),
        totalRevenue: isAdmin ? totalRevenue : 0,
        processingRevenue: isAdmin ? processingRevenue : 0,
        completedRevenue: isAdmin ? completedRevenue : 0,
        averageOrderValue: isAdmin ? avgOrderValue : 0,
      },
      isAdmin,
    });
  } catch (error) {
    console.error('Error fetching analytics data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch analytics data' },
      { status: 500 },
    );
  }
}
