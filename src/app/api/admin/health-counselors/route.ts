import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import User from '@/lib/db/models/User';
import dbConnect from '@/lib/db/connection';
import { withConditionalCache, errorResponse } from '@/lib/api/utils';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user?.role?.toLowerCase().includes('admin')) {
      return errorResponse('Unauthorized', 401, 'AUTH_REQUIRED');
    }

    await dbConnect();

    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') || '';

    // Build query
    const query: any = { role: 'health_counselor' };

    // Add search filter
    if (search) {
      const searchConditions: any[] = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
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

    // Fetch health counselors with search
    const healthCounselors = await User.find(query)
      .select('firstName lastName email avatar phone specializations credentials experience consultationFee bio role status createdAt updatedAt')
      .sort({ firstName: 1, lastName: 1 })
      .lean();

    // Get client count for each health counselor (check both singular and plural assignment fields)
    const healthCounselorsWithCount = await Promise.all(
      healthCounselors.map(async (hc: any) => {
        const clientCount = await User.countDocuments({
          $or: [
            { assignedHealthCounselor: hc._id },
            { assignedHealthCounselors: hc._id }
          ]
        });
        return {
          ...hc,
          clientCount
        };
      })
    );

    const responseData = {
      success: true,
      healthCounselors: healthCounselorsWithCount
    };

    // Use conditional caching for admin API
    return withConditionalCache(responseData, req, {
      maxAge: 30,
      private: true,
    });
  } catch (error: any) {
    console.error('Error fetching health counselors:', error);
    return errorResponse(
      error.message || 'Failed to fetch health counselors',
      500,
      'FETCH_ERROR'
    );
  }
}
