import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import User from '@/lib/db/models/User';
import { UserRole } from '@/types';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

// GET /api/admin/clients - Get all clients for admin (OPTIMIZED)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user has admin role (case-insensitive and flexible)
    const userRole = session.user.role?.toLowerCase();

    if (!userRole || (!userRole.includes('admin') && userRole !== 'admin')) {
      return NextResponse.json({
        error: 'Forbidden - Admin access required',
        userRole: session.user.role
      }, { status: 403 });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || '';
    const assigned = searchParams.get('assigned') || ''; // 'true', 'false', or ''
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100); // Cap at 100
    const page = Math.max(parseInt(searchParams.get('page') || '1'), 1);

    // Build query using $and to avoid $or conflicts
    const andConditions: any[] = [{ role: UserRole.CLIENT }];

    // Filter by assignment status
    if (assigned === 'true') {
      andConditions.push({
        $or: [
          { assignedDietitian: { $ne: null } },
          { assignedDietitians: { $exists: true, $not: { $size: 0 } } }
        ]
      });
    } else if (assigned === 'false') {
      andConditions.push({ assignedDietitian: null });
      andConditions.push({
        $or: [
          { assignedDietitians: { $exists: false } },
          { assignedDietitians: { $size: 0 } }
        ]
      });
    }

    // Filter by status (uses clientStatus: lead/active/inactive)
    if (status) {
      andConditions.push({ clientStatus: status });
    }

    // Add search filter
    if (search) {
      const searchRegex = { $regex: search, $options: 'i' };
      const searchConditions: any[] = [
        { firstName: searchRegex },
        { lastName: searchRegex },
        { email: searchRegex },
        { phone: searchRegex },
        { clientId: searchRegex },
      ];
      // Search by full name (first + last combined)
      const nameParts = search.trim().split(/\s+/);
      if (nameParts.length >= 2) {
        searchConditions.push({
          $and: [
            { firstName: { $regex: nameParts[0], $options: 'i' } },
            { lastName: { $regex: nameParts.slice(1).join(' '), $options: 'i' } }
          ]
        });
      }
      andConditions.push({ $or: searchConditions });
    }

    const query = andConditions.length === 1 ? andConditions[0] : { $and: andConditions };

    // Create cache key based on all query params
    const cacheKey = `admin:clients:v2:${JSON.stringify(query)}:page=${page}:limit=${limit}`;

    // Fetch clients with pagination - use 60s cache (shorter to reflect new clients faster)
    const clientsData = await withCache(
      cacheKey,
      async () => {
        // Get total count and clients in parallel
        const [total, clients] = await Promise.all([
          User.countDocuments(query),
          User.find(query)
            .select('-password -__v')
            .populate('assignedDietitian', 'firstName lastName email avatar')
            .populate('assignedDietitians', 'firstName lastName email avatar')
            .populate('assignedHealthCounselor', 'firstName lastName email avatar')
            .populate('assignedHealthCounselors', 'firstName lastName email avatar')
            .populate({
              path: 'createdBy.userId',
              select: 'firstName lastName role',
              strictPopulate: false
            })
            .sort({ createdAt: -1 })
            .limit(limit)
            .skip((page - 1) * limit)
            .lean()
        ]);

        console.log('[Admin Clients] Query:', JSON.stringify(query), 'Total found:', total, 'Page:', page, 'Limit:', limit);
        return { clients, total };
      },
      { ttl: 60000, tags: ['admin', 'clients'] } // 1 minute cache
    );

    const { clients, total } = clientsData;

    // Get stats with caching
    const stats = await withCache(
      'admin:clients:stats:v3',
      async () => {
        const [totalCount, assignedCount, unassignedCount] = await Promise.all([
          User.countDocuments({ role: UserRole.CLIENT }),
          User.countDocuments({
            role: UserRole.CLIENT,
            $or: [
              { assignedDietitian: { $ne: null } },
              { assignedDietitians: { $exists: true, $not: { $size: 0 } } }
            ]
          }),
          User.countDocuments({
            $and: [
              { role: UserRole.CLIENT },
              { assignedDietitian: null },
              {
                $or: [
                  { assignedDietitians: { $exists: false } },
                  { assignedDietitians: { $size: 0 } }
                ]
              }
            ]
          })
        ]);

        console.log('[Admin Clients] Stats - Total:', totalCount, 'Assigned:', assignedCount, 'Unassigned:', unassignedCount);
        return {
          total: totalCount,
          assigned: assignedCount,
          unassigned: unassignedCount
        };
      },
      { ttl: 60000, tags: ['admin', 'clients', 'stats'] } // 1 minute cache
    );

    return NextResponse.json({
      clients,
      stats,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasMore: page * limit < total
      }
    });

  } catch (error) {
    console.error('Error fetching clients:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to fetch clients', details: errorMessage },
      { status: 500 }
    );
  }
}
