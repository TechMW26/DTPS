import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import User from '@/lib/db/models/User';
import { UserRole } from '@/types';
import { withConditionalCache, errorResponse } from '@/lib/api/utils';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

// GET /api/admin/dietitians - Get all dietitians for admin
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return errorResponse('Unauthorized', 401, 'AUTH_REQUIRED');
    }

    // Check if user has admin role (case-insensitive and flexible)
    const userRole = session.user.role?.toLowerCase();

    if (!userRole || (!userRole.includes('admin') && userRole !== 'admin')) {
      return errorResponse('Forbidden - Admin access required', 403, 'ADMIN_REQUIRED');
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';

    // Build query
    let query: any = { role: UserRole.DIETITIAN };

    // Add search filter
    if (search) {
      const searchConditions: any[] = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { specializations: { $in: [new RegExp(search, 'i')] } }
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
      query.$or = searchConditions;
    }

    const dietitians = await withCache(
      `admin:dietitians:${JSON.stringify(query)}`,
      async () => await User.find(query)
        .select('firstName lastName email avatar phone specializations credentials experience consultationFee bio role status updatedAt')
        .sort({ firstName: 1, lastName: 1 }),
      { ttl: 120000, tags: ['admin'] }
    );

    // Get client count for each dietitian (check both singular and plural assignment fields)
    const dietitiansWithCounts = await Promise.all(
      dietitians.map(async (dietitian) => {
        const clientCount = await User.countDocuments({
          role: UserRole.CLIENT,
          $or: [
            { assignedDietitian: dietitian._id },
            { assignedDietitians: dietitian._id }
          ]
        });
        return {
          ...dietitian.toObject(),
          clientCount
        };
      })
    );

    const responseData = {
      dietitians: dietitiansWithCounts
    };

    // Use conditional caching for admin API (returns 304 if unchanged)
    return withConditionalCache(responseData, request, {
      maxAge: 30, // Cache for 30 seconds
      private: true, // Admin-only, private cache
    });

  } catch (error: any) {
    console.error('Error fetching dietitians:', error);
    return errorResponse(
      error.message || 'Failed to fetch dietitians',
      500,
      'FETCH_ERROR'
    );
  }
}
