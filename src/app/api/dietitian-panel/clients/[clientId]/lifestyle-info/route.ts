import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import LifestyleInfo from '@/lib/db/models/LifestyleInfo';
import User from '@/lib/db/models/User';
import { UserRole } from '@/types';
import { withCache, clearCacheByTag } from '@/lib/api/utils';
import { logActivity } from '@/lib/utils/activityLogger';

export const dynamic = 'force-dynamic';

// GET /api/dietitian-panel/clients/[clientId]/lifestyle-info - Get assigned client lifestyle info
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const [session, , { clientId }] = await Promise.all([
      getServerSession(authOptions),
      connectDB(),
      params,
    ]);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is dietitian
    if (session.user.role !== UserRole.DIETITIAN) {
      return NextResponse.json({ error: 'Forbidden - Dietitian access required' }, { status: 403 });
    }

    // Fetch client once (used for both assignment check and response)
    const client = await withCache(
      `dietitian-panel:clients:clientId:lifestyle-info:${JSON.stringify(clientId)}`,
      async () => await User.findById(clientId),
      { ttl: 120000, tags: ['dietitian_panel'] }
    );
    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    // Verify the dietitian is assigned to this client
    const isAssigned = (
      client.assignedDietitian?.toString() === session.user.id ||
      client.assignedDietitians?.some((d: any) => d.toString() === session.user.id)
    );
    if (!isAssigned) {
      return NextResponse.json({ error: 'You are not assigned to this client' }, { status: 403 });
    }

    const lifestyleInfo = await withCache(
      `dietitian-panel:clients:clientId:lifestyle-info:${JSON.stringify({ userId: clientId })}`,
      async () => await LifestyleInfo.findOne({ userId: clientId }),
      { ttl: 120000, tags: ['dietitian_panel'] }
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

// PUT /api/dietitian-panel/clients/[clientId]/lifestyle-info - Update assigned client lifestyle info
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const [session, , { clientId }, data] = await Promise.all([
      getServerSession(authOptions),
      connectDB(),
      params,
      request.json(),
    ]);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is dietitian
    if (session.user.role !== UserRole.DIETITIAN) {
      return NextResponse.json({ error: 'Forbidden - Dietitian access required' }, { status: 403 });
    }

    // Fetch client once (used for both assignment check and existence)
    const client = await withCache(
      `dietitian-panel:clients:clientId:lifestyle-info:${JSON.stringify(clientId)}`,
      async () => await User.findById(clientId),
      { ttl: 120000, tags: ['dietitian_panel'] }
    );
    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    // Verify the dietitian is assigned to this client
    const isAssigned = (
      client.assignedDietitian?.toString() === session.user.id ||
      client.assignedDietitians?.some((d: any) => d.toString() === session.user.id)
    );
    if (!isAssigned) {
      return NextResponse.json({ error: 'You are not assigned to this client' }, { status: 403 });
    }

    // Calculate feet and inches from cm if cm is provided
    let heightFeet = data.heightFeet;
    let heightInch = data.heightInch;
    if (data.heightCm) {
      const totalInches = data.heightCm / 2.54;
      heightFeet = Math.floor(totalInches / 12);
      heightInch = Math.round(totalInches % 12);
    }

    const lifestyleInfo = await LifestyleInfo.findOneAndUpdate(
      { userId: clientId },
      {
        $set: {
          userId: clientId,
          heightFeet,
          heightInch,
          heightCm: data.heightCm,
          weightKg: data.weightKg,
          targetWeightKg: data.targetWeightKg,
          foodPreference: data.foodPreference,
          preferredCuisine: data.preferredCuisine || [],
          allergiesFood: data.allergiesFood || [],
          fastDays: data.fastDays || [],
          eatOutFrequency: data.eatOutFrequency,
          smokingFrequency: data.smokingFrequency,
          alcoholFrequency: data.alcoholFrequency,
          activityLevel: data.activityLevel,
          cookingOil: data.cookingOil,
          cravingType: data.cravingType,
          sleepPattern: data.sleepPattern,
          stressLevel: data.stressLevel,
          updatedBy: session.user.id,
          updatedByRole: 'dietitian',
          updatedAt: new Date()
        }
      },
      { upsert: true, new: true }
    );

    // Also update user profile height/weight
    await User.findByIdAndUpdate(clientId, {
      $set: {
        heightCm: data.heightCm,
        weightKg: data.weightKg,
        activityLevel: data.activityLevel
      }
    });

    // Log activity
    logActivity({
      userId: session.user.id,
      userRole: 'dietitian',
      userName: session.user.name || session.user.email || '',
      userEmail: session.user.email || '',
      action: 'Updated Lifestyle Info',
      actionType: 'update',
      category: 'profile',
      description: `Dietitian updated lifestyle info for client ${client.firstName || ''} ${client.lastName || ''} (${client.email}).`,
      targetUserId: clientId,
      targetUserName: `${client.firstName || ''} ${client.lastName || ''} (${client.email})`,
    }).catch(() => { });

    // Clear caches so both client and dietitian panels show updated data immediately
    clearCacheByTag('dietitian_panel');
    clearCacheByTag('client');
    clearCacheByTag(`client:lifestyle-info:${clientId}`);

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
