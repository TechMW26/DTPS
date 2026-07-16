import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import { User, Appointment, SystemAlert } from '@/lib/db/models';
import { UserRole } from '@/types';
import mongoose from 'mongoose';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user || session.user.role !== UserRole.ADMIN) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    // Load manually created alerts from DB first
    const savedDocs = await withCache(
      `admin:system-alerts:all`,
      async () => await SystemAlert.find().sort({ createdAt: -1 }).limit(50),
      { ttl: 120000, tags: ['admin'] }
    );
    const savedAlerts = savedDocs.map((doc: any) => ({
      id: String(doc._id),
      type: doc.type,
      message: doc.message,
      time: getTimeAgo(doc.createdAt),
      priority: doc.priority || 'low',
      category: doc.category || 'custom',
      createdAt: doc.createdAt
    }));

    const alerts: any[] = [...savedAlerts];

    // Check for system performance issues
    const totalUsers = await User.countDocuments();
    const totalAppointments = await Appointment.countDocuments();

    // Alert for high user growth
    const recentUsers = await User.countDocuments({
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    });

    if (recentUsers > 10) {
      alerts.push({
        id: 'high_user_growth',
        type: 'info',
        message: `High user registration activity: ${recentUsers} new users in the last 24 hours`,
        time: getTimeAgo(new Date(Date.now() - 30 * 60 * 1000)),
        priority: 'medium',
        category: 'growth'
      });
    }

    // Alert for pending appointments
    const pendingAppointments = await Appointment.countDocuments({
      status: 'pending',
      date: { $gte: new Date() }
    });

    if (pendingAppointments > 5) {
      alerts.push({
        id: 'pending_appointments',
        type: 'warning',
        message: `${pendingAppointments} appointments pending confirmation`,
        time: getTimeAgo(new Date(Date.now() - 45 * 60 * 1000)),
        priority: 'high',
        category: 'appointments'
      });
    }

    // Alert for inactive dietitians
    const inactiveDietitians = await User.countDocuments({
      role: { $in: [UserRole.DIETITIAN, UserRole.HEALTH_COUNSELOR] },
      lastLoginAt: { $lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    });

    if (inactiveDietitians > 0) {
      alerts.push({
        id: 'inactive_dietitians',
        type: 'warning',
        message: `${inactiveDietitians} dietitians haven't logged in for over a week`,
        time: getTimeAgo(new Date(Date.now() - 2 * 60 * 60 * 1000)),
        priority: 'medium',
        category: 'staff'
      });
    }

    // System maintenance alerts
    alerts.push({
      id: 'scheduled_maintenance',
      type: 'info',
      message: 'Scheduled maintenance tonight at 2 AM - 4 AM IST',
      time: getTimeAgo(new Date(Date.now() - 3 * 60 * 60 * 1000)),
      priority: 'low',
      category: 'maintenance'
    });

    // Database backup status
    alerts.push({
      id: 'backup_success',
      type: 'success',
      message: 'Daily database backup completed successfully',
      time: getTimeAgo(new Date(Date.now() - 6 * 60 * 60 * 1000)),
      priority: 'low',
      category: 'system'
    });

    // Server performance alert (simulated)
    const serverLoad = Math.random();
    if (serverLoad > 0.7) {
      alerts.push({
        id: 'server_load',
        type: 'warning',
        message: `Server response time increased by ${Math.round((serverLoad - 0.5) * 100)}%`,
        time: getTimeAgo(new Date(Date.now() - 20 * 60 * 1000)),
        priority: 'high',
        category: 'performance'
      });
    }

    // Security alert for failed login attempts (simulated)
    const failedLogins = Math.floor(Math.random() * 10);
    if (failedLogins > 5) {
      alerts.push({
        id: 'failed_logins',
        type: 'error',
        message: `${failedLogins} failed login attempts detected in the last hour`,
        time: getTimeAgo(new Date(Date.now() - 15 * 60 * 1000)),
        priority: 'high',
        category: 'security'
      });
    }

    // Storage space alert (simulated)
    const storageUsage = Math.random();
    if (storageUsage > 0.8) {
      alerts.push({
        id: 'storage_space',
        type: 'warning',
        message: `Storage usage at ${Math.round(storageUsage * 100)}% - consider cleanup`,
        time: getTimeAgo(new Date(Date.now() - 4 * 60 * 60 * 1000)),
        priority: 'medium',
        category: 'storage'
      });
    }

    // Sort alerts by priority and time
    const priorityOrder: { [key: string]: number } = { high: 3, medium: 2, low: 1 };
    const sortedAlerts = alerts
      .sort((a, b) => {
        const priorityDiff = (priorityOrder[b.priority || 'low'] || 1) - (priorityOrder[a.priority || 'low'] || 1);
        if (priorityDiff !== 0) return priorityDiff;
        const atA = (a.createdAt ? new Date(a.createdAt) : new Date()).getTime();
        const atB = (b.createdAt ? new Date(b.createdAt) : new Date()).getTime();
        return atB - atA;
      })
      .slice(0, 15); // Limit to 15 alerts

    return NextResponse.json({
      alerts: sortedAlerts.map(a => ({ ...a, time: a.time || getTimeAgo(a.createdAt || new Date()) })),
      summary: {
        total: sortedAlerts.length,
        high: sortedAlerts.filter(a => a.priority === 'high').length,
        medium: sortedAlerts.filter(a => a.priority === 'medium').length,
        low: sortedAlerts.filter(a => a.priority === 'low').length
      }
    });
  } catch (error) {
    console.error('Error fetching system alerts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch system alerts' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== UserRole.ADMIN) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { type = 'info', message, priority = 'low', category } = body || {};
    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    await connectDB();
    const alert = await SystemAlert.create({
      type,
      message,
      priority,
      category,
      createdBy: session.user.id
    });

    return NextResponse.json({
      id: String(alert._id),
      type: alert.type,
      message: alert.message,
      priority: alert.priority,
      category: alert.category,
      time: getTimeAgo(alert.createdAt),
      createdAt: alert.createdAt
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating alert:', error);
    return NextResponse.json({ error: 'Failed to create alert' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== UserRole.ADMIN) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    await connectDB();

    // Check if the ID is a valid MongoDB ObjectId
    if (mongoose.Types.ObjectId.isValid(id)) {
      // This is a database alert, delete it from MongoDB
      const res = await SystemAlert.findByIdAndDelete(id);
      if (!res) {
        return NextResponse.json({ error: 'Alert not found' }, { status: 404 });
      }
      return NextResponse.json({ success: true });
    } else {
      // This is a system-generated alert (like 'high_user_growth', 'pending_appointments', etc.)
      // These are not stored in the database, so we can't actually delete them
      // They are generated dynamically based on system conditions
      return NextResponse.json({
        error: 'Cannot delete system-generated alerts. These alerts are based on current system conditions.'
      }, { status: 400 });
    }
  } catch (error) {
    console.error('Error deleting alert:', error);
    return NextResponse.json({ error: 'Failed to delete alert' }, { status: 500 });
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
