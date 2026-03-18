import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import User from '@/lib/db/models/User';
import { UserRole } from '@/types';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

// GET /api/users/dietitians - Get all dietitians
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

    // Check if admin role
    const isAdmin = session.user.role?.toLowerCase()?.includes('admin');

    // Build query - include both dietitians and health counselors
    let query: any = {
      role: { $in: [UserRole.DIETITIAN, UserRole.HEALTH_COUNSELOR] },
    };

    // Admin always sees ALL dietitians regardless of status
    // Non-admin, non-client users see only active
    if (!isAdmin && session.user.role !== UserRole.CLIENT) {
      query.status = 'active';
    }

    // For clients, show their assigned dietitian (regardless of status) or all active
    if (session.user.role === UserRole.CLIENT) {
      const currentUser = await withCache(
        `users:dietitians:${JSON.stringify(session.user.id)}`,
        async () => await User.findById(session.user.id).select('assignedDietitian'),
        { ttl: 120000, tags: ['users'] }
      );

      if (currentUser?.assignedDietitian) {
        // Override query to show only assigned dietitian (regardless of status)
        query = {
          _id: currentUser.assignedDietitian,
        };
      } else {
        // If no assigned dietitian, show all active dietitians
        query = {
          role: { $in: [UserRole.DIETITIAN, UserRole.HEALTH_COUNSELOR] },
          status: 'active'
        };
      }
    }

    // Add search filter
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { specializations: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    // Add specialization filter
    if (specialization) {
      query.specializations = { $in: [specialization] };
    }

    // Select fields
    let selectFields = 'firstName lastName email avatar bio experience consultationFee specializations credentials status';
    if (includeAvailability) {
      selectFields += ' availability';
    }

    const dietitians = await withCache(
      `users:dietitians:${JSON.stringify(query)}`,
      async () => await User.find(query)
        .select(selectFields)
        .sort({ firstName: 1, lastName: 1 })
      ,
      { ttl: 120000, tags: ['users'] }
    );

    // Format the response
    const formattedDietitians = dietitians.map(dietitian => ({
      _id: dietitian._id,
      firstName: dietitian.firstName,
      lastName: dietitian.lastName,
      fullName: `${dietitian.firstName} ${dietitian.lastName}`,
      email: dietitian.email,
      avatar: dietitian.avatar,
      bio: dietitian.bio,
      experience: dietitian.experience,
      consultationFee: dietitian.consultationFee,
      specializations: dietitian.specializations || [],
      credentials: dietitian.credentials || [],
      status: dietitian.status || 'active',
      availability: includeAvailability ? dietitian.availability : undefined
    }));

    return NextResponse.json({
      dietitians: formattedDietitians,
      total: formattedDietitians.length
    });

  } catch (error) {
    console.error('Error fetching dietitians:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dietitians' },
      { status: 500 }
    );
  }
}
