import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import User from '@/lib/db/models/User';
import { History } from '@/lib/db/models/History';
import { UserRole } from '@/types';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

// GET /api/users/[id]/history - Get client activity history
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    // Check permissions
    const targetUser = await withCache(
      `users:id:history:${JSON.stringify(id)}`,
      async () => await User.findById(id).select('assignedDietitian assignedDietitians'),
      { ttl: 120000, tags: ['users'] }
    );
    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const isAdmin = session.user.role === UserRole.ADMIN;
    const isSelf = session.user.id === id;
    const isDietitianAssigned =
      session.user.role === UserRole.DIETITIAN &&
      (targetUser.assignedDietitian?.toString() === session.user.id ||
        targetUser.assignedDietitians?.some((d: any) => d.toString() === session.user.id));

    if (!isAdmin && !isSelf && !isDietitianAssigned) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const category = searchParams.get('category');
    const limit = parseInt(searchParams.get('limit') || '50');
    const page = parseInt(searchParams.get('page') || '1');
    const skip = (page - 1) * limit;

    // Build query
    const query: any = { userId: id };
    if (category) {
      query.category = category;
    }

    // Fetch real history from database
    const history = await withCache(
      `users:id:history:${JSON.stringify(query)}:page=${page}:limit=${limit}`,
      async () => await History.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      { ttl: 120000, tags: ['users'] }
    );

    const total = await History.countDocuments(query);

    // If no history found, return empty array
    if (history.length === 0) {
      return NextResponse.json(
        {
          success: true,
          history: [],
          pagination: {
            total: 0,
            page,
            limit,
            pages: 0,
          },
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        history,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Error fetching history:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// POST /api/users/[id]/history - Create a history entry
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    let body: {
      action?: string;
      category?: string;
      description?: string;
      changeDetails?: unknown;
      metadata?: Record<string, unknown>;
    } = {};
    try {
      const text = await request.text();
      if (text) {
        body = JSON.parse(text);
      }
    } catch (error) {
      // If body is empty or invalid JSON, use empty object
      body = {};
    }

    const {
      action = 'update',
      category = 'other',
      description,
      changeDetails,
      metadata,
    } = body;

    if (!description) {
      return NextResponse.json(
        { success: false, error: 'Description is required' },
        { status: 400 }
      );
    }

    // Get request metadata
    const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    // Get current user details
    const currentUser = await withCache(
      `users:id:history:${JSON.stringify(session.user.id)}`,
      async () => await User.findById(session.user.id).select('firstName lastName email role'),
      { ttl: 120000, tags: ['users'] }
    );

    const historyEntry = await History.create({
      userId: id,
      action,
      category,
      description,
      changeDetails: changeDetails || [],
      performedBy: {
        userId: session.user.id,
        name: `${currentUser?.firstName || ''} ${currentUser?.lastName || ''}`.trim(),
        email: currentUser?.email,
        role: currentUser?.role,
      },
      metadata,
      ipAddress,
      userAgent,
    });

    return NextResponse.json(
      {
        success: true,
        history: historyEntry,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Error creating history entry:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
