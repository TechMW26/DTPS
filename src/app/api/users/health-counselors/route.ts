import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import User from '@/lib/db/models/User';
import { UserRole } from '@/types';

// GET /api/users/health-counselors - Get all health counselors
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const includeAvailability = searchParams.get('includeAvailability') === 'true';
    const search = searchParams.get('search');
    const specialization = searchParams.get('specialization');

    // Build query - get health counselors
    const query: any = {
      role: UserRole.HEALTH_COUNSELOR,
      status: 'active'
    };

    // Add search functionality
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    // Add specialization filter
    if (specialization) {
      query.specializations = { $in: [specialization] };
    }

    let selectFields = 'firstName lastName email phone bio experience consultationFee specializations credentials avatar createdAt';
    
    if (includeAvailability) {
      selectFields += ' availability';
    }

    const healthCounselors = await User.find(query)
      .select(selectFields)
      .sort({ createdAt: -1 });

    return NextResponse.json({
      success: true,
      healthCounselors,
      count: healthCounselors.length
    });

  } catch (error) {
    console.error('Error fetching health counselors:', error);
    return NextResponse.json(
      { error: 'Failed to fetch health counselors' },
      { status: 500 }
    );
  }
}
