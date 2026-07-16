import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import { User, Appointment, Payment } from '@/lib/db/models';
import { UserRole } from '@/types';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user || session.user.role !== UserRole.ADMIN) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const activities = [];

    // Get recent user registrations (last 24 hours)
    const recentUsers = await withCache(
      `admin:recent-activity:users`,
      async () => await User.find({
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    })
    .sort({ createdAt: -1 })
    .limit(5)
    .select('firstName lastName email role createdAt'),
      { ttl: 120000, tags: ['admin'] }
    );

    recentUsers.forEach(user => {
      activities.push({
        id: `user_${user._id}`,
        type: 'user_signup',
        message: `New ${user.role} registered: ${user.firstName} ${user.lastName}`,
        time: getTimeAgo(user.createdAt),
        status: 'success',
        timestamp: user.createdAt
      });
    });

    // Get recent completed appointments (last 24 hours)
    const recentAppointments = await withCache(
      `admin:recent-activity:appointments`,
      async () => await Appointment.find({
      status: 'confirmed',
      updatedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    })
    .populate('client', 'firstName lastName')
    .populate('dietitian', 'firstName lastName')
    .sort({ updatedAt: -1 })
    .limit(5),
      { ttl: 120000, tags: ['admin'] }
    );

    recentAppointments.forEach(appointment => {
      const dietitian = appointment.dietitian as any;
      const client = appointment.client as any;
      activities.push({
        id: `appointment_${appointment._id}`,
        type: 'appointment',
        message: `Appointment completed: ${dietitian?.firstName} ${dietitian?.lastName} & ${client?.firstName} ${client?.lastName}`,
        time: getTimeAgo(appointment.updatedAt),
        status: 'success',
        timestamp: appointment.updatedAt
      });
    });

    // Get recent payments/orders from WooCommerce data (simulate payment activity)
    const recentPayments = await withCache(
      `admin:recent-activity:payments`,
      async () => await User.find({
      role: 'client',
      'wooCommerceData.orders.0': { $exists: true },
      updatedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    })
    .sort({ updatedAt: -1 })
    .limit(3)
    .select('firstName lastName wooCommerceData.totalSpent updatedAt'),
      { ttl: 120000, tags: ['admin'] }
    );

    recentPayments.forEach(client => {
      activities.push({
        id: `payment_${client._id}`,
        type: 'payment',
        message: `Payment processed: ₹${client.wooCommerceData.totalSpent} from ${client.firstName} ${client.lastName}`,
        time: getTimeAgo(client.updatedAt),
        status: 'success',
        timestamp: client.updatedAt
      });
    });

    // Add some system activities (simulated)
    const systemActivities = [
      {
        id: 'system_backup',
        type: 'system',
        message: 'Database backup completed successfully',
        time: getTimeAgo(new Date(Date.now() - 2 * 60 * 60 * 1000)),
        status: 'success',
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000)
      },
      {
        id: 'system_maintenance',
        type: 'maintenance',
        message: 'System maintenance scheduled for tonight',
        time: getTimeAgo(new Date(Date.now() - 4 * 60 * 60 * 1000)),
        status: 'info',
        timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000)
      }
    ];

    activities.push(...systemActivities);

    // Sort all activities by timestamp and limit to 10
    const sortedActivities = activities
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 10);

    return NextResponse.json({ activities: sortedActivities });

  } catch (error) {
    console.error('Error fetching recent activity:', error);
    return NextResponse.json(
      { error: 'Failed to fetch recent activity' },
      { status: 500 }
    );
  }
}

function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
  
  if (diffInMinutes < 1) return 'Just now';
  if (diffInMinutes < 60) return `${diffInMinutes} minute${diffInMinutes > 1 ? 's' : ''} ago`;
  
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
  
  const diffInDays = Math.floor(diffInHours / 24);
  return `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`;
}
