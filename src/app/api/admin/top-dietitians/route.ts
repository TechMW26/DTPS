import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import { User, Appointment } from '@/lib/db/models';
import { Types } from 'mongoose';
import { UserRole } from '@/types';
import { withCache } from '@/lib/api/utils';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user || session.user.role !== UserRole.ADMIN) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    // Optional limit query param: ?limit=5 or ?limit=all
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get('limit');
    const limit = limitParam === 'all' ? null : parseInt(limitParam || '10');

    // Get all dietitians with their client counts and appointment stats
    const dietitians = await withCache(
      `admin:top-dietitians:${JSON.stringify({
        role: { $in: [UserRole.DIETITIAN, UserRole.HEALTH_COUNSELOR] },
        status: 'active'
      })}`,
      async () => await User.find({
        role: { $in: [UserRole.DIETITIAN, UserRole.HEALTH_COUNSELOR] },
        status: 'active'
      }).select('firstName lastName email avatar createdAt').lean(),
      { ttl: 120000, tags: ['admin'] }
    );

    const dietitianIds = dietitians.map((dietitian) => new Types.ObjectId(String(dietitian._id)));
    const now = new Date();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [clientCounts, appointmentStats, recentClientCounts] = await Promise.all([
      dietitianIds.length > 0
        ? User.aggregate<{ _id: Types.ObjectId; count: number }>([
          {
            $match: {
              role: UserRole.CLIENT,
              assignedDietitian: { $in: dietitianIds },
            },
          },
          {
            $group: {
              _id: '$assignedDietitian',
              count: { $sum: 1 },
            },
          },
        ])
        : Promise.resolve([]),
      dietitianIds.length > 0
        ? Appointment.aggregate<{
          _id: Types.ObjectId;
          totalAppointments: number;
          completedAppointments: number;
        }>([
          {
            $match: {
              dietitian: { $in: dietitianIds },
            },
          },
          {
            $group: {
              _id: '$dietitian',
              totalAppointments: { $sum: 1 },
              completedAppointments: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ['$status', 'confirmed'] },
                        { $lt: ['$scheduledAt', now] },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
            },
          },
        ])
        : Promise.resolve([]),
      dietitianIds.length > 0
        ? User.aggregate<{ _id: Types.ObjectId; count: number }>([
          {
            $match: {
              role: UserRole.CLIENT,
              assignedDietitian: { $in: dietitianIds },
              updatedAt: { $gte: thirtyDaysAgo },
            },
          },
          {
            $group: {
              _id: '$assignedDietitian',
              count: { $sum: 1 },
            },
          },
        ])
        : Promise.resolve([]),
    ]);

    const clientCountByDietitian = new Map(
      clientCounts.map((entry) => [String(entry._id), entry.count])
    );
    const appointmentStatsByDietitian = new Map(
      appointmentStats.map((entry) => [
        String(entry._id),
        {
          totalAppointments: entry.totalAppointments,
          completedAppointments: entry.completedAppointments,
        },
      ])
    );
    const recentClientCountByDietitian = new Map(
      recentClientCounts.map((entry) => [String(entry._id), entry.count])
    );

    const topDietitians = [];

    for (const dietitian of dietitians) {
      const dietitianId = String(dietitian._id);
      const clientCount = clientCountByDietitian.get(dietitianId) || 0;
      const stats = appointmentStatsByDietitian.get(dietitianId);
      const completedAppointments = stats?.completedAppointments || 0;
      const totalAppointments = stats?.totalAppointments || 0;

      // Calculate estimated revenue (₹500 per appointment)
      const estimatedRevenue = completedAppointments * 500;

      // Calculate rating based on completion rate and client count
      const completionRate = totalAppointments > 0 ? completedAppointments / totalAppointments : 0;
      const rating = Math.min(4.9, 3.5 + (completionRate * 1.4) + (Math.min(clientCount, 50) / 100));
      const recentClients = recentClientCountByDietitian.get(dietitianId) || 0;

      topDietitians.push({
        id: dietitian._id,
        name: `${dietitian.firstName} ${dietitian.lastName}`,
        email: dietitian.email,
        avatar: dietitian.avatar,
        clients: clientCount,
        rating: Math.round(rating * 10) / 10,
        revenue: estimatedRevenue,
        completedAppointments,
        totalAppointments,
        completionRate: Math.round(completionRate * 100),
        recentActivity: recentClients,
        joinedDate: dietitian.createdAt
      });
    }

    // Sort by a combination of client count, completion rate, and revenue
    const sorted = topDietitians.sort((a, b) => {
      const scoreA = (a.clients * 0.4) + (a.completionRate * 0.3) + (a.revenue / 1000 * 0.3);
      const scoreB = (b.clients * 0.4) + (b.completionRate * 0.3) + (b.revenue / 1000 * 0.3);
      return scoreB - scoreA;
    });
    const limited = limit ? sorted.slice(0, limit) : sorted;

    return NextResponse.json({
      topDietitians: limited,
      totalDietitians: dietitians.length
    });

  } catch (error) {
    console.error('Error fetching top dietitians:', error);
    return NextResponse.json(
      { error: 'Failed to fetch top dietitians' },
      { status: 500 }
    );
  }
}
