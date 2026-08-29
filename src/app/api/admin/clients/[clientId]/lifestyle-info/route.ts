import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import LifestyleInfo from '@/lib/db/models/LifestyleInfo';
import User from '@/lib/db/models/User';
import { withCache } from '@/lib/api/utils';
import {
  pickDefinedFields,
  pickDefinedLifestyleFields,
} from '@/lib/api/lifestyle-fields';

export const dynamic = 'force-dynamic';

// GET /api/admin/clients/[clientId]/lifestyle-info - Get client lifestyle info
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

    // Verify the client exists
    const client = await withCache(
      `admin:clients:clientId:lifestyle-info:${JSON.stringify(clientId)}`,
      async () => await User.findById(clientId),
      { ttl: 120000, tags: ['admin'] }
    );
    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    const lifestyleInfo = await withCache(
      `admin:clients:clientId:lifestyle-info:${JSON.stringify({ userId: clientId })}`,
      async () => await LifestyleInfo.findOne({ userId: clientId }),
      { ttl: 120000, tags: ['admin'] }
    );

    return NextResponse.json({
      success: true,
      data: lifestyleInfo || {},
      client: {
        id: client._id,
        firstName: client.firstName,
        lastName: client.lastName,
        email: client.email
      }
    });
  } catch (error) {
    console.error('Error fetching client lifestyle info:', error);
    return NextResponse.json({ error: 'Failed to fetch lifestyle info' }, { status: 500 });
  }
}

// PUT /api/admin/clients/[clientId]/lifestyle-info - Update client lifestyle info
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
    const client = await withCache(
      `admin:clients:clientId:lifestyle-info:${JSON.stringify(clientId)}`,
      async () => await User.findById(clientId),
      { ttl: 120000, tags: ['admin'] }
    );
    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    const data = await request.json();

    // Calculate feet and inches from cm if cm is provided
    let heightFeet = data.heightFeet;
    let heightInch = data.heightInch;
    if (data.heightCm) {
      const totalInches = data.heightCm / 2.54;
      heightFeet = Math.floor(totalInches / 12);
      heightInch = Math.round(totalInches % 12);
    }

    const lifestyleUpdate = pickDefinedLifestyleFields({
      ...data,
      heightFeet,
      heightInch,
    });
    const lifestyleInfo = await LifestyleInfo.findOneAndUpdate(
      { userId: clientId },
      {
        $set: {
          ...lifestyleUpdate,
          userId: clientId,
          updatedBy: session.user.id,
          updatedByRole: 'admin',
          updatedAt: new Date()
        }
      },
      { upsert: true, new: true }
    );

    // Also update user profile height/weight
    const userProfileUpdate = pickDefinedFields({
        heightCm: data.heightCm,
        weightKg: data.weightKg,
        activityLevel: data.activityLevel,
    });
    if (Object.keys(userProfileUpdate).length > 0) {
      await User.findByIdAndUpdate(clientId, { $set: userProfileUpdate });
    }

    return NextResponse.json({
      success: true,
      message: 'Lifestyle info updated successfully',
      data: lifestyleInfo
    });
  } catch (error) {
    console.error('Error updating client lifestyle info:', error);
    return NextResponse.json({ error: 'Failed to update lifestyle info' }, { status: 500 });
  }
}
