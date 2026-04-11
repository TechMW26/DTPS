import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import User from '@/lib/db/models/User';
import { UserRole } from '@/types';
import { withCache, clearCacheByTag } from '@/lib/api/utils';
import { logActivity } from '@/lib/utils/activityLogger';
import { validateEmail } from '@/lib/validations/auth';
import { validatePhoneNumber } from '@/lib/validations/contact';

export const dynamic = 'force-dynamic';

// Helper function to check if dietitian is assigned to client
async function isDietitianAssigned(dietitianId: string, clientId: string): Promise<boolean> {
  const client = await withCache(
    `dietitian-panel:clients:clientId:profile:${JSON.stringify(clientId)}`,
    async () => await User.findById(clientId).select('assignedDietitian assignedDietitians'),
    { ttl: 120000, tags: ['dietitian_panel'] }
  );
  if (!client) return false;

  return (
    client.assignedDietitian?.toString() === dietitianId ||
    client.assignedDietitians?.some((d: any) => d.toString() === dietitianId)
  );
}

// GET /api/dietitian-panel/clients/[clientId]/profile - Get assigned client profile
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

    const client = await withCache(
      `dietitian-panel:clients:clientId:profile:${JSON.stringify(clientId)}`,
      async () => await User.findById(clientId)
        .select('-password')
        .populate('assignedDietitian', 'firstName lastName email')
        .populate('assignedDietitians', 'firstName lastName email'),
      { ttl: 120000, tags: ['dietitian_panel'] }
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

// PUT /api/dietitian-panel/clients/[clientId]/profile - Update assigned client profile
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
    const existingClient = await withCache(
      `dietitian-panel:clients:clientId:profile:${JSON.stringify(clientId)}`,
      async () => await User.findById(clientId),
      { ttl: 120000, tags: ['dietitian_panel'] }
    );
    if (!existingClient) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    const data = await request.json();
    const normalizedEmail = typeof data.email === 'string'
      ? data.email.trim().toLowerCase()
      : undefined;
    const normalizedPhone = typeof data.phone === 'string'
      ? data.phone.trim()
      : undefined;

    if (normalizedEmail) {
      const emailValidation = validateEmail(normalizedEmail);
      if (!emailValidation.isValid) {
        return NextResponse.json({ error: emailValidation.error || 'Invalid email address' }, { status: 400 });
      }

      if (normalizedEmail !== (existingClient.email || '').trim().toLowerCase()) {
        const existingUser = await User.findOne({
          email: normalizedEmail,
          _id: { $ne: clientId }
        }).select('_id');

        if (existingUser) {
          return NextResponse.json({ error: 'Email already exists' }, { status: 400 });
        }
      }
    }

    if (normalizedPhone) {
      const phoneValidation = validatePhoneNumber(normalizedPhone);
      if (!phoneValidation.isValid) {
        return NextResponse.json({ error: phoneValidation.error || 'Invalid phone number' }, { status: 400 });
      }

      if (phoneValidation.normalized !== (existingClient.phone || '').trim()) {
        const existingUser = await User.findOne({
          phone: phoneValidation.normalized,
          _id: { $ne: clientId }
        }).select('_id');

        if (existingUser) {
          return NextResponse.json({ error: 'Phone number already exists' }, { status: 400 });
        }
      }
    }

    const updateData: any = {
      firstName: data.firstName,
      lastName: data.lastName,
      email: normalizedEmail,
      phone: normalizedPhone ? validatePhoneNumber(normalizedPhone).normalized : undefined,
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
      updatedByRole: 'dietitian',
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

    // Log activity
    const changedFields = Object.keys(updateData).filter(
      k => !['updatedBy', 'updatedByRole', 'updatedAt'].includes(k)
    );
    logActivity({
      userId: session.user.id,
      userRole: 'dietitian',
      userName: session.user.name || session.user.email || '',
      userEmail: session.user.email || '',
      action: 'Updated Client Profile',
      actionType: 'update',
      category: 'profile',
      description: `Dietitian updated profile for client ${existingClient.firstName || ''} ${existingClient.lastName || ''} (${existingClient.email}). Fields: ${changedFields.join(', ')}`,
      targetUserId: clientId,
      targetUserName: `${existingClient.firstName || ''} ${existingClient.lastName || ''} (${existingClient.email})`,
      changeDetails: changedFields.map(f => ({
        fieldName: f,
        oldValue: (existingClient as any)[f] ?? null,
        newValue: updateData[f] ?? null,
      })),
    }).catch(() => { });

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
