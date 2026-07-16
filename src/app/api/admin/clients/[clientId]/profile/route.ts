import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import User from '@/lib/db/models/User';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

export const dynamic = 'force-dynamic';

// GET /api/admin/clients/[clientId]/profile - Get client profile
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const userRole = session.user.role?.toLowerCase();
    if (!userRole?.includes('admin')) {
      return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
    }

    const { clientId } = await params;
    await connectDB();

    const client = await withCache(
      `admin:clients:clientId:profile:${JSON.stringify(clientId)}`,
      async () => await User.findById(clientId)
      .select('-password')
      .populate('assignedDietitian', 'firstName lastName email')
      .populate('assignedDietitians', 'firstName lastName email'),
      { ttl: 120000, tags: ['admin'] }
    );

    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: client
    });
  } catch (error) {
    console.error('Error fetching client profile:', error);
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
  }
}

// PUT /api/admin/clients/[clientId]/profile - Update client profile
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const userRole = session.user.role?.toLowerCase();
    if (!userRole?.includes('admin')) {
      return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
    }

    const { clientId } = await params;
    await connectDB();

    // Verify the client exists
    const existingClient = await withCache(
      `admin:clients:clientId:profile:${JSON.stringify(clientId)}`,
      async () => await User.findById(clientId),
      { ttl: 120000, tags: ['admin'] }
    );
    if (!existingClient) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    const data = await request.json();

    // Calculate feet and inches from cm if cm is provided
    let heightCm = data.heightCm;
    if (data.heightCm) {
      const totalInches = data.heightCm / 2.54;
      const feet = Math.floor(totalInches / 12);
      const inches = Math.round(totalInches % 12);
      // Store both formats
    }

    const updateData: any = {
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone,
      gender: data.gender,
      dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
      heightCm: data.heightCm,
      weightKg: data.weightKg,
      activityLevel: data.activityLevel,
      generalGoal: data.generalGoal,
      dietType: data.dietType,
      allergies: data.allergies || [],
      dailyGoals: data.dailyGoals,
      goals: data.goals,
      updatedBy: session.user.id,
      updatedByRole: 'admin',
      updatedAt: new Date()
    };

    // Remove undefined values
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined) {
        delete updateData[key];
      }
    });

    const client = await User.findByIdAndUpdate(
      clientId,
      { $set: updateData },
      { new: true }
    ).select('-password');

    return NextResponse.json({
      success: true,
      message: 'Profile updated successfully',
      data: client
    });
  } catch (error) {
    console.error('Error updating client profile:', error);
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}
