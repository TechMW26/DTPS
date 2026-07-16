import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import DietaryRecall from '@/lib/db/models/DietaryRecall';
import User from '@/lib/db/models/User';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

export const dynamic = 'force-dynamic';

// GET /api/admin/clients/[clientId]/dietary-recall - Get client dietary recall
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
      `admin:clients:clientId:dietary-recall:${JSON.stringify(clientId)}`,
      async () => await User.findById(clientId),
      { ttl: 120000, tags: ['admin'] }
    );
    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    const dietaryRecall = await withCache(
      `admin:clients:clientId:dietary-recall:${JSON.stringify({ userId: clientId })}`,
      async () => await DietaryRecall.findOne({ userId: clientId }),
      { ttl: 120000, tags: ['admin'] }
    );

    return NextResponse.json({
      success: true,
      data: dietaryRecall || {},
      client: {
        id: client._id,
        firstName: client.firstName,
        lastName: client.lastName,
        email: client.email
      }
    });
  } catch (error) {
    console.error('Error fetching client dietary recall:', error);
    return NextResponse.json({ error: 'Failed to fetch dietary recall' }, { status: 500 });
  }
}

// PUT /api/admin/clients/[clientId]/dietary-recall - Update client dietary recall
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
      `admin:clients:clientId:dietary-recall:${JSON.stringify(clientId)}`,
      async () => await User.findById(clientId),
      { ttl: 120000, tags: ['admin'] }
    );
    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    const data = await request.json();

    const dietaryRecall = await DietaryRecall.findOneAndUpdate(
      { userId: clientId },
      {
        $set: {
          userId: clientId,
          meals: data.meals || [],
          updatedBy: session.user.id,
          updatedByRole: 'admin',
          updatedAt: new Date()
        }
      },
      { upsert: true, new: true }
    );

    return NextResponse.json({
      success: true,
      message: 'Dietary recall updated successfully',
      data: dietaryRecall
    });
  } catch (error) {
    console.error('Error updating client dietary recall:', error);
    return NextResponse.json({ error: 'Failed to update dietary recall' }, { status: 500 });
  }
}
