import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import Appointment from '@/lib/db/models/Appointment';
import User from '@/lib/db/models/User';

export async function GET() {
  try {
    const [session] = await Promise.all([
      getServerSession(authOptions),
      connectDB(),
    ]);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Forbidden - Admin access required' },
        { status: 403 },
      );
    }

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const sixMonthStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const activeSince = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // These two facets replace repeated full-collection scans and the previous
    // twelve-query monthly loop while keeping the API response unchanged.
    const [userFacetRows, appointmentFacetRows] = await Promise.all([
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
                  totalRevenue: { $sum: { $ifNull: ['$wooCommerceData.totalSpent', 0] } },
                  monthlyRevenue: {
                    $sum: {
                      $cond: [
                        {
                          $and: [
                            { $gte: ['$wooCommerceData.lastOrderDate', startOfMonth] },
                            { $lt: ['$wooCommerceData.lastOrderDate', endOfToday] },
                          ],
                        },
                        { $ifNull: ['$wooCommerceData.totalSpent', 0] },
                        0,
                      ],
                    },
                  },
                  totalOrders: { $sum: { $ifNull: ['$wooCommerceData.totalOrders', 0] } },
                  repeatCustomers: {
                    $sum: { $cond: [{ $gt: ['$wooCommerceData.totalOrders', 1] }, 1, 0] },
                  },
                },
              },
            ],
            topClients: [
              { $match: { 'wooCommerceData.totalSpent': { $gt: 0 } } },
              { $sort: { 'wooCommerceData.totalSpent': -1 } },
              { $limit: 10 },
              {
                $project: {
                  firstName: 1,
                  lastName: 1,
                  email: 1,
                  'wooCommerceData.totalSpent': 1,
                  'wooCommerceData.totalOrders': 1,
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
            appointmentTypes: [
              { $group: { _id: '$type', count: { $sum: 1 } } },
              { $sort: { count: -1 } },
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
          },
        },
      ]),
    ]);

    const userFacet = userFacetRows[0] || {};
    const appointmentFacet = appointmentFacetRows[0] || {};
    const userSummary = userFacet.summary?.[0] || {};
    const appointmentSummary = appointmentFacet.summary?.[0] || {};
    const totalClients = userSummary.totalClients || 0;
    const totalRevenue = userSummary.totalRevenue || 0;
    const totalOrders = userSummary.totalOrders || 0;

    const revenueByKey = new Map(
      (userFacet.revenueByMonth || []).map((row: any) => [row._id, row.revenue || 0]),
    );
    const appointmentsByKey = new Map(
      (appointmentFacet.appointmentsByMonth || []).map((row: any) => [row._id, row.count || 0]),
    );
    const appointmentsByMonth = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      return {
        month: date.toLocaleDateString('en-IN', {
          month: 'short',
          timeZone: 'Asia/Kolkata',
        }),
        appointments: Number(appointmentsByKey.get(key) || 0),
        revenue: Number(revenueByKey.get(key) || 0),
      };
    });

    return NextResponse.json({
      totalClients,
      activeClients: userSummary.activeClients || 0,
      totalAppointments: appointmentSummary.totalAppointments || 0,
      completedAppointments: appointmentSummary.completedAppointments || 0,
      totalRevenue,
      monthlyRevenue: userSummary.monthlyRevenue || 0,
      avgOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
      clientRetentionRate:
        totalClients > 0
          ? Math.round(((userSummary.repeatCustomers || 0) / totalClients) * 100)
          : 0,
      appointmentsByMonth,
      topClients: (userFacet.topClients || []).map((client: any) => ({
        clientName: `${client.firstName || ''} ${client.lastName || ''}`.trim(),
        email: client.email,
        totalSpent: client.wooCommerceData?.totalSpent || 0,
        totalOrders: client.wooCommerceData?.totalOrders || 0,
      })),
      appointmentTypes: (appointmentFacet.appointmentTypes || []).map((type: any) => ({
        type: type._id || 'Consultation',
        count: type.count,
        revenue: type.count * 100,
      })),
      revenueByMonth: appointmentsByMonth.map((month) => ({
        month: month.month,
        revenue: month.revenue,
      })),
    });
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch admin dashboard statistics' },
      { status: 500 },
    );
  }
}
