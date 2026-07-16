import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import MedicalInfo from '@/lib/db/models/MedicalInfo';
import User from '@/lib/db/models/User';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

export const dynamic = 'force-dynamic';

// GET /api/admin/clients/[clientId]/medical-info - Get client medical info
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
      `admin:clients:clientId:medical-info:${JSON.stringify(clientId)}`,
      async () => await User.findById(clientId),
      { ttl: 120000, tags: ['admin'] }
    );
    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    const medicalInfo = await withCache(
      `admin:clients:clientId:medical-info:${JSON.stringify({ userId: clientId })}`,
      async () => await MedicalInfo.findOne({ userId: clientId }),
      { ttl: 120000, tags: ['admin'] }
    );

    return NextResponse.json({
      success: true,
      data: medicalInfo || {},
      client: {
        id: client._id,
        firstName: client.firstName,
        lastName: client.lastName,
        email: client.email
      }
    });
  } catch (error) {
    console.error('Error fetching client medical info:', error);
    return NextResponse.json({ error: 'Failed to fetch medical info' }, { status: 500 });
  }
}

// PUT /api/admin/clients/[clientId]/medical-info - Update client medical info
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
      `admin:clients:clientId:medical-info:${JSON.stringify(clientId)}`,
      async () => await User.findById(clientId),
      { ttl: 120000, tags: ['admin'] }
    );
    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    const data = await request.json();

    const medicalInfo = await MedicalInfo.findOneAndUpdate(
      { userId: clientId },
      {
        $set: {
          userId: clientId,
          bloodGroup: data.bloodGroup,
          medicalConditions: data.medicalConditions || [],
          allergies: data.allergies || [],
          dietaryRestrictions: data.dietaryRestrictions || [],
          gutIssues: data.gutIssues || [],
          isPregnant: data.isPregnant || false,
          isLactating: data.isLactating || false,
          menstrualCycle: data.menstrualCycle,
          bloodFlow: data.bloodFlow,
          diseaseHistory: data.diseaseHistory || [],
          updatedBy: session.user.id,
          updatedByRole: 'admin',
          updatedAt: new Date()
        }
      },
      { upsert: true, new: true }
    );

    return NextResponse.json({
      success: true,
      message: 'Medical info updated successfully',
      data: medicalInfo
    });
  } catch (error) {
    console.error('Error updating client medical info:', error);
    return NextResponse.json({ error: 'Failed to update medical info' }, { status: 500 });
  }
}
