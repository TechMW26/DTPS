import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import AdminAuditLog from '@/lib/db/models/AdminAuditLog';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const User = (await connectDB()).model('User');
    const user = await User.findOne({ email: session.user.email });

    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const adminId = searchParams.get('adminId');
    const targetUserId = searchParams.get('targetUserId');
    const action = searchParams.get('action');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 500);
    const page = Math.max(parseInt(searchParams.get('page') || '0'), 0);
    const skip = page * limit;

    // Build filter
    const filter: any = {};

    if (adminId) {
      filter.adminId = adminId;
    }

    if (targetUserId) {
      filter.targetUserId = targetUserId;
    }

    if (action) {
      filter.action = action;
    }

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) {
        filter.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        filter.createdAt.$lte = new Date(endDate);
      }
    }

    // Fetch total count
    const total = await AdminAuditLog.countDocuments(filter);

    // Fetch audit logs
    const logs = await AdminAuditLog.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .lean();

    return NextResponse.json({
      logs,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch audit logs' },
      { status: 500 }
    );
  }
}
