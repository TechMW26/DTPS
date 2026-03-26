import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import SystemAlert from '@/lib/db/models/SystemAlert';
import { UserRole } from '@/types';
import { withCache, clearCacheByTag } from '@/lib/api/utils';
import { startOfTodayIST } from '@/lib/utils/ist';

// GET /api/system-alerts - Get system alerts
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins can view system alerts
    if (session.user.role !== UserRole.ADMIN) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const type = searchParams.get('type');
    const source = searchParams.get('source');
    const priority = searchParams.get('priority');
    const category = searchParams.get('category');
    const status = searchParams.get('status');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const search = searchParams.get('search');

    // Build query
    const query: any = {};

    if (type) {
      query.type = type;
    }

    if (source) {
      query.source = source;
    }

    if (priority) {
      query.priority = priority;
    }

    if (category) {
      query.category = category;
    }

    if (status) {
      query.status = status;
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        query.createdAt.$lte = new Date(endDate);
      }
    }

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { message: { $regex: search, $options: 'i' } },
        { affectedResource: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (page - 1) * limit;

    const [alerts, total] = await Promise.all([
      SystemAlert.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('createdBy', 'firstName lastName email')
        .populate('resolvedBy', 'firstName lastName email')
        .lean(),
      SystemAlert.countDocuments(query)
    ]);

    // Get alert stats
    const stats = await withCache(
      `system-alerts:${JSON.stringify([
        {
          $facet: {
            byType: [
              { $group: { _id: '$type', count: { $sum: 1 } } }
            ],
            bySource: [
              { $group: { _id: '$source', count: { $sum: 1 } } }
            ],
            byPriority: [
              { $group: { _id: '$priority', count: { $sum: 1 } } }
            ],
            byStatus: [
              { $group: { _id: '$status', count: { $sum: 1 } } }
            ],
            byCategory: [
              { $group: { _id: '$category', count: { $sum: 1 } } }
            ],
            unreadCount: [
              { $match: { isRead: false } },
              { $count: 'count' }
            ],
            criticalCount: [
              { $match: { priority: 'critical', status: 'new' } },
              { $count: 'count' }
            ],
            todayCount: [
              { $match: { createdAt: { $gte: startOfTodayIST() } } },
              { $count: 'count' }
            ]
          }
        }
      ])}`,
      async () => await SystemAlert.aggregate([
        {
          $facet: {
            byType: [
              { $group: { _id: '$type', count: { $sum: 1 } } }
            ],
            bySource: [
              { $group: { _id: '$source', count: { $sum: 1 } } }
            ],
            byPriority: [
              { $group: { _id: '$priority', count: { $sum: 1 } } }
            ],
            byStatus: [
              { $group: { _id: '$status', count: { $sum: 1 } } }
            ],
            byCategory: [
              { $group: { _id: '$category', count: { $sum: 1 } } }
            ],
            unreadCount: [
              { $match: { isRead: false } },
              { $count: 'count' }
            ],
            criticalCount: [
              { $match: { priority: 'critical', status: 'new' } },
              { $count: 'count' }
            ],
            todayCount: [
              { $match: { createdAt: { $gte: startOfTodayIST() } } },
              { $count: 'count' }
            ]
          }
        }
      ]),
      { ttl: 120000, tags: ['system_alerts'] }
    );

    return NextResponse.json({
      alerts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      },
      stats: {
        byType: stats[0]?.byType || [],
        bySource: stats[0]?.bySource || [],
        byPriority: stats[0]?.byPriority || [],
        byStatus: stats[0]?.byStatus || [],
        byCategory: stats[0]?.byCategory || [],
        unreadCount: stats[0]?.unreadCount[0]?.count || 0,
        criticalCount: stats[0]?.criticalCount[0]?.count || 0,
        todayCount: stats[0]?.todayCount[0]?.count || 0
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

// POST /api/system-alerts - Create system alert manually
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== UserRole.ADMIN) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await connectDB();

    const body = await request.json();

    const alert = await SystemAlert.create({
      ...body,
      createdBy: session.user.id,
      status: 'new',
      isRead: false,
      notificationSent: false
    });

    return NextResponse.json({ alert }, { status: 201 });
  } catch (error) {
    console.error('Error creating system alert:', error);
    return NextResponse.json(
      { error: 'Failed to create system alert' },
      { status: 500 }
    );
  }
}

// DELETE /api/system-alerts - Clear old resolved alerts (admin only)
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== UserRole.ADMIN) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const daysOld = parseInt(searchParams.get('daysOld') || '30');

    await connectDB();

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await SystemAlert.deleteMany({
      status: { $in: ['resolved', 'ignored'] },
      createdAt: { $lt: cutoffDate }
    });

    return NextResponse.json({
      message: `Deleted ${result.deletedCount} resolved/ignored alerts older than ${daysOld} days`
    });
  } catch (error) {
    console.error('Error deleting system alerts:', error);
    return NextResponse.json(
      { error: 'Failed to delete system alerts' },
      { status: 500 }
    );
  }
}
