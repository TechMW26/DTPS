import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import User from '@/lib/db/models/User';
import Appointment from '@/lib/db/models/Appointment';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

// GET /api/dashboard/admin-stats - Get real admin dashboard statistics
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only allow admins to access this endpoint
    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
    }

    // Connect to MongoDB
    await connectDB();

    // Get current date for calculations
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);

    // Run all independent queries concurrently to avoid N+1 round-trips
    const [
      totalClients,
      activeClients,
      totalAppointments,
      completedAppointments,
      revenueAggregation,
      monthlyRevenueAggregation,
      avgOrderAggregation,
      repeatCustomers,
      topClients,
      appointmentTypes
    ] = await Promise.all([
      // Total clients
      User.countDocuments({ role: 'client' }),
      // Active clients
      User.countDocuments({
        role: 'client',
        $or: [
          { 'wooCommerceData.totalOrders': { $gt: 0 } },
          { lastLoginAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
          { updatedAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }
        ]
      }),
      // Total appointments
      Appointment.countDocuments({}),
      // Completed appointments
      Appointment.countDocuments({ status: 'confirmed', date: { $lt: startOfToday } }),
      // Total revenue
      withCache(
        `dashboard:admin-stats:revenue-total`,
        async () => User.aggregate([
          { $match: { role: 'client', 'wooCommerceData.totalSpent': { $exists: true } } },
          { $group: { _id: null, totalRevenue: { $sum: '$wooCommerceData.totalSpent' } } }
        ]),
        { ttl: 120000, tags: ['dashboard'] }
      ),
      // Monthly revenue
      withCache(
        `dashboard:admin-stats:revenue-month-${startOfMonth.toISOString()}`,
        async () => User.aggregate([
          { $match: { role: 'client', 'wooCommerceData.lastOrderDate': { $gte: startOfMonth, $lt: endOfToday } } },
          { $group: { _id: null, monthlyRevenue: { $sum: '$wooCommerceData.totalSpent' } } }
        ]),
        { ttl: 120000, tags: ['dashboard'] }
      ),
      // Average order value
      withCache(
        `dashboard:admin-stats:avg-order`,
        async () => User.aggregate([
          { $match: { role: 'client', 'wooCommerceData.totalOrders': { $gt: 0 } } },
          { $group: { _id: null, totalOrders: { $sum: '$wooCommerceData.totalOrders' }, totalRevenue: { $sum: '$wooCommerceData.totalSpent' } } }
        ]),
        { ttl: 120000, tags: ['dashboard'] }
      ),
      // Repeat customers (for retention rate)
      User.countDocuments({ role: 'client', 'wooCommerceData.totalOrders': { $gt: 1 } }),
      // Top clients by spending
      withCache(
        `dashboard:admin-stats:top-clients`,
        async () => User.find({ role: 'client', 'wooCommerceData.totalSpent': { $gt: 0 } })
          .sort({ 'wooCommerceData.totalSpent': -1 })
          .limit(10)
          .select('firstName lastName email wooCommerceData.totalSpent wooCommerceData.totalOrders'),
        { ttl: 120000, tags: ['dashboard'] }
      ),
      // Appointment types distribution
      withCache(
        `dashboard:admin-stats:appointment-types`,
        async () => Appointment.aggregate([
          { $group: { _id: '$type', count: { $sum: 1 } } },
          { $sort: { count: -1 } }
        ]),
        { ttl: 120000, tags: ['dashboard'] }
      )
    ]);

    const totalRevenue = revenueAggregation[0]?.totalRevenue || 0;
    const monthlyRevenue = monthlyRevenueAggregation[0]?.monthlyRevenue || 0;
    const avgOrderValue = avgOrderAggregation[0]
      ? avgOrderAggregation[0].totalRevenue / avgOrderAggregation[0].totalOrders
      : 0;
    const clientRetentionRate = totalClients > 0 ? Math.round((repeatCustomers / totalClients) * 100) : 0;

    // Get appointments by month (last 6 months) — run all 6 months concurrently
    const monthRanges = Array.from({ length: 6 }, (_, i) => {
      const idx = 5 - i;
      const monthStart = new Date(today.getFullYear(), today.getMonth() - idx, 1);
      const monthEnd = new Date(today.getFullYear(), today.getMonth() - idx + 1, 0);
      return { monthStart, monthEnd, label: monthStart.toLocaleDateString('en-IN', { month: 'short', timeZone: 'Asia/Kolkata' }) };
    });

    const monthResults = await Promise.all(
      monthRanges.map(({ monthStart, monthEnd, label }) =>
        Promise.all([
          Appointment.countDocuments({ date: { $gte: monthStart, $lte: monthEnd } }),
          withCache(
            `dashboard:admin-stats:revenue-${label}-${monthStart.getFullYear()}`,
            async () => User.aggregate([
              { $match: { role: 'client', 'wooCommerceData.lastOrderDate': { $gte: monthStart, $lte: monthEnd } } },
              { $group: { _id: null, revenue: { $sum: '$wooCommerceData.totalSpent' } } }
            ]),
            { ttl: 120000, tags: ['dashboard'] }
          )
        ]).then(([appointments, revenue]) => ({
          month: label,
          appointments,
          revenue: revenue[0]?.revenue || 0
        }))
      )
    );
    const appointmentsByMonth = monthResults;

    return NextResponse.json({
      totalClients,
      activeClients,
      totalAppointments,
      completedAppointments,
      totalRevenue,
      monthlyRevenue,
      avgOrderValue,
      clientRetentionRate,
      appointmentsByMonth,
      topClients: topClients.map(client => ({
        clientName: `${client.firstName} ${client.lastName}`,
        email: client.email,
        totalSpent: client.wooCommerceData?.totalSpent || 0,
        totalOrders: client.wooCommerceData?.totalOrders || 0
      })),
      appointmentTypes: appointmentTypes.map(type => ({
        type: type._id || 'Consultation',
        count: type.count,
        revenue: type.count * 100 // Estimate ₹100 per appointment
      })),
      revenueByMonth: appointmentsByMonth.map(month => ({
        month: month.month,
        revenue: month.revenue
      }))
    });

  } catch (error) {
    console.error('Error fetching admin stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch admin dashboard statistics' },
      { status: 500 }
    );
  }
}
