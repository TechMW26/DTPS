import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import User from '@/lib/db/models/User';
import Appointment from '@/lib/db/models/Appointment';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

// GET /api/analytics/stats - Get real analytics data
export async function GET(request: NextRequest) {
  try {
    // Run auth + DB connection in PARALLEL
    const [session] = await Promise.all([
      getServerSession(authOptions),
      connectDB()
    ]);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const isAdmin = session.user.role === 'admin';
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    // Get total clients count
    const totalClients = await User.countDocuments({ role: 'client' });

    // Get active clients
    const activeClients = await User.countDocuments({
      role: 'client',
      $or: [
        { 'wooCommerceData.totalOrders': { $gt: 0 } },
        { lastLoginAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
        { updatedAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }
      ]
    });

    // Get total appointments
    const totalAppointments = await Appointment.countDocuments({});

    // Get completed appointments
    const completedAppointments = await Appointment.countDocuments({
      status: 'confirmed',
      date: { $lt: startOfToday }
    });

    // Revenue data (only for admins)
    let totalRevenue = 0;
    let monthlyRevenue = 0;
    let avgOrderValue = 0;
    let revenueByMonth = [];
    let processingRevenue = 0;
    let completedRevenue = 0;

    if (isAdmin) {
      // Calculate total revenue from WooCommerce data
      const revenueAggregation = await withCache(
        `analytics:stats:${JSON.stringify([
          { $match: { role: 'client', 'wooCommerceData.totalSpent': { $exists: true } } },
          { $group: { _id: null, totalRevenue: { $sum: '$wooCommerceData.totalSpent' } } }
        ])}`,
        async () => await User.aggregate([
          { $match: { role: 'client', 'wooCommerceData.totalSpent': { $exists: true } } },
          { $group: { _id: null, totalRevenue: { $sum: '$wooCommerceData.totalSpent' } } }
        ]),
        { ttl: 120000, tags: ['analytics'] }
      );
      totalRevenue = revenueAggregation[0]?.totalRevenue || 0;

      // Calculate monthly revenue (current month)
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const monthlyRevenueAgg = await withCache(
        `analytics:stats:${JSON.stringify([
          {
            $match: {
              role: 'client',
              'wooCommerceData.lastOrderDate': {
                $gte: startOfMonth,
                $lt: new Date(today.getFullYear(), today.getMonth() + 1, 1)
              }
            }
          },
          { $group: { _id: null, monthlyRevenue: { $sum: '$wooCommerceData.totalSpent' } } }
        ])}`,
        async () => await User.aggregate([
          {
            $match: {
              role: 'client',
              'wooCommerceData.lastOrderDate': {
                $gte: startOfMonth,
                $lt: new Date(today.getFullYear(), today.getMonth() + 1, 1)
              }
            }
          },
          { $group: { _id: null, monthlyRevenue: { $sum: '$wooCommerceData.totalSpent' } } }
        ]),
        { ttl: 120000, tags: ['analytics'] }
      );
      monthlyRevenue = monthlyRevenueAgg[0]?.monthlyRevenue || 0;

      // Calculate average order value
      const avgOrderAgg = await withCache(
        `analytics:stats:${JSON.stringify([
          { $match: { role: 'client', 'wooCommerceData.totalOrders': { $gt: 0 } } },
          {
            $group: {
              _id: null,
              totalOrders: { $sum: '$wooCommerceData.totalOrders' },
              totalRevenue: { $sum: '$wooCommerceData.totalSpent' }
            }
          }
        ])}`,
        async () => await User.aggregate([
          { $match: { role: 'client', 'wooCommerceData.totalOrders': { $gt: 0 } } },
          {
            $group: {
              _id: null,
              totalOrders: { $sum: '$wooCommerceData.totalOrders' },
              totalRevenue: { $sum: '$wooCommerceData.totalSpent' }
            }
          }
        ]),
        { ttl: 120000, tags: ['analytics'] }
      );
      avgOrderValue = avgOrderAgg[0]
        ? avgOrderAgg[0].totalRevenue / avgOrderAgg[0].totalOrders
        : 0;

      // Revenue by month (last 6 months)
      revenueByMonth = [];
      for (let i = 5; i >= 0; i--) {
        const monthStart = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const monthEnd = new Date(today.getFullYear(), today.getMonth() - i + 1, 0);

        const monthRevenue = await withCache(
          `analytics:stats:${JSON.stringify([
            {
              $match: {
                role: 'client',
                'wooCommerceData.lastOrderDate': {
                  $gte: monthStart,
                  $lte: monthEnd
                }
              }
            },
            { $group: { _id: null, revenue: { $sum: '$wooCommerceData.totalSpent' } } }
          ])}`,
          async () => await User.aggregate([
            {
              $match: {
                role: 'client',
                'wooCommerceData.lastOrderDate': {
                  $gte: monthStart,
                  $lte: monthEnd
                }
              }
            },
            { $group: { _id: null, revenue: { $sum: '$wooCommerceData.totalSpent' } } }
          ]),
          { ttl: 120000, tags: ['analytics'] }
        );

        revenueByMonth.push({
          month: monthStart.toLocaleDateString('en-IN', { month: 'short', timeZone: 'Asia/Kolkata' }),
          revenue: monthRevenue[0]?.revenue || 0
        });
      }

      // Processing and completed revenue estimates
      processingRevenue = totalRevenue * 0.2; // Estimate 20% processing
      completedRevenue = totalRevenue * 0.8;  // Estimate 80% completed
    }

    // Appointments by month (last 6 months)
    const appointmentsByMonth = [];
    for (let i = 5; i >= 0; i--) {
      const monthStart = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const monthEnd = new Date(today.getFullYear(), today.getMonth() - i + 1, 0);

      const monthAppointments = await Appointment.countDocuments({
        date: { $gte: monthStart, $lte: monthEnd }
      });

      appointmentsByMonth.push({
        month: monthStart.toLocaleDateString('en-IN', { month: 'short', timeZone: 'Asia/Kolkata' }),
        appointments: monthAppointments,
        revenue: isAdmin ? (monthAppointments * 100) : 0 // Estimate ₹100 per appointment
      });
    }

    // Appointment types distribution
    const appointmentTypes = await withCache(
      `analytics:stats:${JSON.stringify([
        { $group: { _id: '$type', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ])}`,
      async () => await Appointment.aggregate([
        { $group: { _id: '$type', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      { ttl: 120000, tags: ['analytics'] }
    );

    // Client progress (mock data for now)
    const clientProgress = [
      { clientName: 'Sarah Wilson', weightLoss: 8.5, adherence: 92 },
      { clientName: 'Mike Johnson', weightLoss: 12.3, adherence: 88 },
      { clientName: 'Emma Davis', weightLoss: 6.7, adherence: 95 },
      { clientName: 'John Smith', weightLoss: 15.2, adherence: 85 },
      { clientName: 'Lisa Brown', weightLoss: 9.8, adherence: 90 }
    ];

    // Calculate retention rate
    const repeatCustomers = await User.countDocuments({
      role: 'client',
      'wooCommerceData.totalOrders': { $gt: 1 }
    });
    const clientRetentionRate = totalClients > 0 ? Math.round((repeatCustomers / totalClients) * 100) : 0;

    // WooCommerce summary
    const wooSummary = {
      totalClients,
      processingOrders: Math.floor(totalClients * 0.1), // Estimate 10% processing
      completedOrders: Math.floor(totalClients * 0.7),  // Estimate 70% completed
      totalRevenue: isAdmin ? totalRevenue : 0,
      processingRevenue: isAdmin ? processingRevenue : 0,
      completedRevenue: isAdmin ? completedRevenue : 0,
      averageOrderValue: isAdmin ? avgOrderValue : 0
    };

    return NextResponse.json({
      totalClients,
      activeClients,
      totalAppointments,
      completedAppointments,
      totalRevenue: isAdmin ? totalRevenue : 0,
      monthlyRevenue: isAdmin ? monthlyRevenue : 0,
      avgSessionDuration: 45, // Mock data
      clientRetentionRate,
      appointmentsByMonth,
      clientProgress,
      appointmentTypes: appointmentTypes.map(type => ({
        type: type._id || 'Consultation',
        count: type.count,
        revenue: isAdmin ? (type.count * 100) : 0
      })),
      revenueByMonth: isAdmin ? revenueByMonth : [],
      wooSummary,
      isAdmin
    });

  } catch (error) {
    console.error('Error fetching analytics data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch analytics data' },
      { status: 500 }
    );
  }
}
