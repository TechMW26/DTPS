import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import MedicalInfo from '@/lib/db/models/MedicalInfo';
import User from '@/lib/db/models/User';
import { UserRole } from '@/types';
import { withCache, clearCacheByTag } from '@/lib/api/utils';
import { logActivity } from '@/lib/utils/activityLogger';

export const dynamic = 'force-dynamic';

// Helper function to check if dietitian is assigned to client
async function isDietitianAssigned(dietitianId: string, clientId: string): Promise<boolean> {
  const client = await withCache(
    `dietitian-panel:clients:clientId:medical-info:${JSON.stringify(clientId)}`,
    async () => await User.findById(clientId).select('assignedDietitian assignedDietitians'),
    { ttl: 120000, tags: ['dietitian_panel'] }
  );
  if (!client) return false;

  return (
    client.assignedDietitian?.toString() === dietitianId ||
    client.assignedDietitians?.some((d: any) => d.toString() === dietitianId)
  );
}

// GET /api/dietitian-panel/clients/[clientId]/medical-info - Get assigned client medical info
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is dietitian
    if (session.user.role !== UserRole.DIETITIAN) {
      return NextResponse.json({ error: 'Forbidden - Dietitian access required' }, { status: 403 });
    }

    const { clientId } = await params;
    await connectDB();

    // Verify the dietitian is assigned to this client
    const isAssigned = await isDietitianAssigned(session.user.id, clientId);
    if (!isAssigned) {
      return NextResponse.json({ error: 'You are not assigned to this client' }, { status: 403 });
    }

    // Verify the client exists
    const client = await withCache(
      `dietitian-panel:clients:clientId:medical-info:${JSON.stringify(clientId)}`,
      async () => await User.findById(clientId),
      { ttl: 120000, tags: ['dietitian_panel'] }
    );
    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    const medicalInfo = await withCache(
      `dietitian-panel:clients:clientId:medical-info:${JSON.stringify({ userId: clientId })}`,
      async () => await MedicalInfo.findOne({ userId: clientId }),
      { ttl: 120000, tags: ['dietitian_panel'] }
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

// PUT /api/dietitian-panel/clients/[clientId]/medical-info - Update assigned client medical info
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is dietitian
    if (session.user.role !== UserRole.DIETITIAN) {
      return NextResponse.json({ error: 'Forbidden - Dietitian access required' }, { status: 403 });
    }

    const { clientId } = await params;
    await connectDB();

    // Verify the dietitian is assigned to this client
    const isAssigned = await isDietitianAssigned(session.user.id, clientId);
    if (!isAssigned) {
      return NextResponse.json({ error: 'You are not assigned to this client' }, { status: 403 });
    }

    // Verify the client exists
    const client = await withCache(
      `dietitian-panel:clients:clientId:medical-info:${JSON.stringify(clientId)}`,
      async () => await User.findById(clientId),
      { ttl: 120000, tags: ['dietitian_panel'] }
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
          updatedByRole: 'dietitian',
          updatedAt: new Date()
        }
      },
      { upsert: true, new: true }
    );

    // Log activity
    logActivity({
      userId: session.user.id,
      userRole: 'dietitian',
      userName: session.user.name || session.user.email || '',
      userEmail: session.user.email || '',
      action: 'Updated Medical Info',
      actionType: 'update',
      category: 'other',
      description: `Dietitian updated medical info for client ${client.firstName || ''} ${client.lastName || ''} (${client.email}).`,
      targetUserId: clientId,
      targetUserName: `${client.firstName || ''} ${client.lastName || ''} (${client.email})`,
    }).catch(() => { });

    // Clear caches so both client and dietitian panels show updated data immediately
    clearCacheByTag('dietitian_panel');
    clearCacheByTag('client');
    clearCacheByTag(`client:medical-info:${clientId}`);

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
