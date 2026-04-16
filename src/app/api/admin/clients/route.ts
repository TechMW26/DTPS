import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import User from '@/lib/db/models/User';
import { UserRole } from '@/types';
import { withCache, clearCacheByTag } from '@/lib/api/utils';
import { Types } from 'mongoose';

function isValidObjectId(id: unknown): boolean {
  if (!id) return false;
  if (id instanceof Types.ObjectId) return true;
  if (typeof id !== 'string') return false;
  return Types.ObjectId.isValid(id) && String(new Types.ObjectId(id)) === id;
}

function normalizeObjectId(id: unknown): string | null {
  if (!id) return null;
  if (id instanceof Types.ObjectId) return id.toString();
  if (typeof id === 'string' && isValidObjectId(id)) return id;
  return null;
}

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
    const dateFrom = searchParams.get('dateFrom') || ''; // ISO date string
    const dateTo = searchParams.get('dateTo') || ''; // ISO date string
    const dietitianId = searchParams.get('dietitianId') || ''; // primary dietitian ObjectId
    const healthCounselorId = searchParams.get('healthCounselorId') || ''; // primary HC ObjectId
    const onboarding = searchParams.get('onboarding') || ''; // 'done' or 'pending'
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100); // Cap at 100
    const page = Math.max(parseInt(searchParams.get('page') || '1'), 1);

    // Build query using $and to avoid $or conflicts
    const andConditions: any[] = [{ role: UserRole.CLIENT }];

    // Filter by assignment status (assigned = has any dietitian assigned)
    if (assigned === 'true') {
      andConditions.push({
        $or: [
          { assignedDietitian: { $exists: true, $ne: null } },
          { assignedDietitians: { $exists: true, $not: { $size: 0 } } }
        ]
      });
    } else if (assigned === 'false') {
      // Unassigned = no primary dietitian AND no secondary dietitians
      andConditions.push({
        $and: [
          { $or: [{ assignedDietitian: null }, { assignedDietitian: { $exists: false } }] },
          { $or: [{ assignedDietitians: { $exists: false } }, { assignedDietitians: { $size: 0 } }, { assignedDietitians: null }] }
        ]
      });
    }

    // Filter by status (uses clientStatus: lead/active/inactive)
    if (status) {
      andConditions.push({ clientStatus: status });
    }

    // Add search filter
    if (search && search.trim()) {
      // Escape special regex characters
      const normalizedSearch = search.trim();
      const escapedSearch = normalizedSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const searchRegex = { $regex: escapedSearch, $options: 'i' };
      const searchConditions: any[] = [
        { firstName: searchRegex },
        { lastName: searchRegex },
        { email: searchRegex },
        { phone: searchRegex },
        { clientId: searchRegex },
      ];

      // Phone-friendly search (ignores formatting characters)
      const digitsOnly = normalizedSearch.replace(/\D/g, '');
      if (digitsOnly.length >= 6) {
        // Use \+ to escape the + character in regex
        const phonePatterns = Array.from(new Set([
          digitsOnly,
          `\\+91${digitsOnly}`,
          `91${digitsOnly}`
        ]));
        for (const pattern of phonePatterns) {
          searchConditions.push({ phone: { $regex: pattern, $options: 'i' } });
        }
      }

      // Search by full name (first + last combined)
      const nameParts = normalizedSearch.split(/\s+/);
      if (nameParts.length >= 2) {
        const firstNameRegex = { $regex: nameParts[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
        const lastNameRegex = { $regex: nameParts.slice(1).join(' ').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
        searchConditions.push({
          $and: [
            { firstName: firstNameRegex },
            { lastName: lastNameRegex }
          ]
        });

        // Also support reversed input: "Last First"
        const reversedFirstNameRegex = { $regex: nameParts.slice(1).join(' ').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
        const reversedLastNameRegex = { $regex: nameParts[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
        searchConditions.push({
          $and: [
            { firstName: reversedFirstNameRegex },
            { lastName: reversedLastNameRegex }
          ]
        });
      }
      andConditions.push({ $or: searchConditions });
    }

    // Date range filter on createdAt
    if (dateFrom || dateTo) {
      const dateCondition: any = {};
      if (dateFrom) dateCondition.$gte = new Date(dateFrom);
      if (dateTo) {
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 59, 999);
        dateCondition.$lte = toDate;
      }
      andConditions.push({ createdAt: dateCondition });
    }

    // Primary dietitian filter
    if (dietitianId) {
      if (!isValidObjectId(dietitianId)) {
        return NextResponse.json({ error: 'Invalid dietitianId' }, { status: 400 });
      }
      andConditions.push({ assignedDietitian: new Types.ObjectId(dietitianId) });
    }

    // Primary health counselor filter
    if (healthCounselorId) {
      if (!isValidObjectId(healthCounselorId)) {
        return NextResponse.json({ error: 'Invalid healthCounselorId' }, { status: 400 });
      }
      andConditions.push({ assignedHealthCounselor: new Types.ObjectId(healthCounselorId) });
    }

    // Onboarding status filter
    if (onboarding === 'done') {
      andConditions.push({ onboardingCompleted: true });
    } else if (onboarding === 'pending') {
      andConditions.push({ $or: [{ onboardingCompleted: false }, { onboardingCompleted: { $exists: false } }] });
    }

    const query = andConditions.length === 1 ? andConditions[0] : { $and: andConditions };

    // Log active filters for debugging
    console.log('[Admin Clients API] Active filters:', {
      search: search || 'none',
      status: status || 'all',
      assigned: assigned || 'all',
      dietitianId: dietitianId || 'all',
      healthCounselorId: healthCounselorId || 'all',
      onboarding: onboarding || 'all',
      dateRange: (dateFrom || dateTo) ? `${dateFrom || '*'} to ${dateTo || '*'}` : 'none',
      totalConditions: andConditions.length
    });

    // Create cache key based on all query params
    const cacheKey = `admin:clients:v4:${JSON.stringify(query)}:page=${page}:limit=${limit}`;

    // Fetch clients with pagination - use 60s cache (shorter to reflect new clients faster)
    const clientsData = await withCache(
      cacheKey,
      async () => {
        // Get total count and clients in parallel
        const [total, rawClients] = await Promise.all([
          User.countDocuments(query),
          User.find(query)
            .select('-password -__v')
            .sort({ createdAt: -1 })
            .limit(limit)
            .skip((page - 1) * limit)
            .lean()
        ]);

        const userIdsToHydrate = new Set<string>();

        for (const client of rawClients as any[]) {
          const assignedDietitianId = normalizeObjectId(client?.assignedDietitian);
          if (assignedDietitianId) userIdsToHydrate.add(assignedDietitianId);

          const assignedHealthCounselorId = normalizeObjectId(client?.assignedHealthCounselor);
          if (assignedHealthCounselorId) userIdsToHydrate.add(assignedHealthCounselorId);

          if (Array.isArray(client?.assignedDietitians)) {
            for (const id of client.assignedDietitians) {
              const normalized = normalizeObjectId(id);
              if (normalized) userIdsToHydrate.add(normalized);
            }
          }

          if (Array.isArray(client?.assignedHealthCounselors)) {
            for (const id of client.assignedHealthCounselors) {
              const normalized = normalizeObjectId(id);
              if (normalized) userIdsToHydrate.add(normalized);
            }
          }

          const createdByUserId = normalizeObjectId(client?.createdBy?.userId);
          if (createdByUserId) userIdsToHydrate.add(createdByUserId);
        }

        const hydratedUsers = userIdsToHydrate.size > 0
          ? await User.find({
            _id: {
              $in: Array.from(userIdsToHydrate).map((id) => new Types.ObjectId(id))
            }
          })
            .select('firstName lastName email avatar role')
            .lean()
          : [];

        const hydratedUsersMap = new Map(
          (hydratedUsers as any[]).map((u) => [u._id.toString(), u])
        );

        const clients = (rawClients as any[]).map((client: any) => {
          const assignedDietitianId = normalizeObjectId(client.assignedDietitian);
          const assignedHealthCounselorId = normalizeObjectId(client.assignedHealthCounselor);

          const assignedDietitians = Array.isArray(client.assignedDietitians)
            ? client.assignedDietitians
              .map((id: unknown) => normalizeObjectId(id))
              .filter((id: string | null): id is string => !!id)
              .map((id: string) => hydratedUsersMap.get(id))
              .filter(Boolean)
            : [];

          const assignedHealthCounselors = Array.isArray(client.assignedHealthCounselors)
            ? client.assignedHealthCounselors
              .map((id: unknown) => normalizeObjectId(id))
              .filter((id: string | null): id is string => !!id)
              .map((id: string) => hydratedUsersMap.get(id))
              .filter(Boolean)
            : [];

          const createdByUserId = normalizeObjectId(client?.createdBy?.userId);

          return {
            ...client,
            assignedDietitian: assignedDietitianId ? hydratedUsersMap.get(assignedDietitianId) || null : null,
            assignedDietitians,
            assignedHealthCounselor: assignedHealthCounselorId ? hydratedUsersMap.get(assignedHealthCounselorId) || null : null,
            assignedHealthCounselors,
            createdBy: client?.createdBy
              ? {
                ...client.createdBy,
                userId: createdByUserId ? hydratedUsersMap.get(createdByUserId) || null : null
              }
              : client?.createdBy
          };
        });

        console.log('[Admin Clients] Query:', JSON.stringify(query), 'Total found:', total, 'Page:', page, 'Limit:', limit);
        return { clients, total };
      },
      { ttl: 60000, tags: ['admin', 'clients'] } // 1 minute cache
    );

    const { clients, total } = clientsData;

    // Get stats with caching (shorter TTL for more accurate counts)
    const stats = await withCache(
      'admin:clients:stats:v4',
      async () => {
        const [totalCount, assignedCount, unassignedCount] = await Promise.all([
          User.countDocuments({ role: UserRole.CLIENT }),
          User.countDocuments({
            role: UserRole.CLIENT,
            $or: [
              { assignedDietitian: { $exists: true, $ne: null } },
              { assignedDietitians: { $exists: true, $not: { $size: 0 } } }
            ]
          }),
          User.countDocuments({
            role: UserRole.CLIENT,
            $and: [
              { $or: [{ assignedDietitian: null }, { assignedDietitian: { $exists: false } }] },
              { $or: [{ assignedDietitians: { $exists: false } }, { assignedDietitians: { $size: 0 } }, { assignedDietitians: null }] }
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
      { ttl: 30000, tags: ['admin', 'clients', 'stats'] } // 30 second cache for faster updates
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
