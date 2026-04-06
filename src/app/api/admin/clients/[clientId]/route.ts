import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import User from '@/lib/db/models/User';
import ClientMealPlan from '@/lib/db/models/ClientMealPlan';
import UnifiedPayment from '@/lib/db/models/UnifiedPayment';
import { UserRole } from '@/types';
import { withCache, clearCacheByTag } from '@/lib/api/utils';
import { logActivity } from '@/lib/utils/activityLogger';
import mongoose from 'mongoose';

// Helper: human-readable role label
function roleLabel(r?: string) {
  if (!r) return 'Admin';
  const map: Record<string, string> = {
    admin: 'Admin',
    dietitian: 'Dietitian',
    health_counselor: 'Health Counselor',
    'health-counselor': 'Health Counselor',
    healthcounselor: 'Health Counselor',
    client: 'Client',
  };
  return map[r] ?? r;
}

// Helper function to validate MongoDB ObjectId
function isValidObjectId(id: string): boolean {
  return mongoose.Types.ObjectId.isValid(id) && new mongoose.Types.ObjectId(id).toString() === id;
}

// Helper function to check if dietitian/health-counselor is assigned to client
async function isStaffAssignedToClient(staffId: string, clientId: string): Promise<boolean> {
  try {
    const result = await User.findById(clientId).select('assignedDietitian assignedDietitians assignedHealthCounselor assignedHealthCounselors').lean();
    const client = result as Record<string, any> | null;
    if (!client) return false;

    const staffIdStr = staffId.toString();
    return (
      client.assignedDietitian?.toString() === staffIdStr ||
      (Array.isArray(client.assignedDietitians) && client.assignedDietitians.some((d: any) => d?.toString() === staffIdStr)) ||
      client.assignedHealthCounselor?.toString() === staffIdStr ||
      (Array.isArray(client.assignedHealthCounselors) && client.assignedHealthCounselors.some((hc: any) => hc?.toString() === staffIdStr))
    );
  } catch (error) {
    console.error('[isStaffAssignedToClient] Error checking assignment:', error);
    return false;
  }
}

// GET /api/admin/clients/[clientId] - Get full client details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  let clientId: string = '';

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { clientId: rawClientId } = await params;
    clientId = rawClientId;

    // Validate clientId format
    if (!clientId || !isValidObjectId(clientId)) {
      return NextResponse.json({
        error: 'Invalid client ID format',
        details: 'The provided client ID is not a valid MongoDB ObjectId'
      }, { status: 400 });
    }

    // Establish DB connection first
    await connectDB();

    const userRole = session.user.role?.toLowerCase();
    const userId = session.user.id;
    const isAdmin = userRole?.includes('admin');
    const isDietitian = userRole === 'dietitian';
    const isHealthCounselor = userRole === 'health-counselor' || userRole === 'healthcounselor' || userRole === 'health_counselor';

    // Check authorization: admin can access all, dietitian/HC can only access assigned clients
    if (!isAdmin && !isDietitian && !isHealthCounselor) {
      return NextResponse.json({
        error: 'Forbidden - Access denied',
        details: `Role '${userRole}' does not have permission to access client data`
      }, { status: 403 });
    }

    // For non-admin roles, verify they are assigned to this client
    if (!isAdmin) {
      const isAssigned = await isStaffAssignedToClient(userId, clientId);

      if (!isAssigned) {
        return NextResponse.json({
          error: 'You are not assigned to this client',
          details: 'Access denied - no assignment relationship found'
        }, { status: 403 });
      }
    }

    // Fetch client without cache first to debug
    const clientResult = await User.findById(clientId)
      .select('-password')
      .populate('assignedDietitian', 'firstName lastName email avatar phone specializations')
      .populate('assignedDietitians', 'firstName lastName email avatar phone specializations')
      .populate('assignedHealthCounselor', 'firstName lastName email avatar phone')
      .populate('assignedHealthCounselors', 'firstName lastName email avatar phone')
      .populate('tags')
      .lean();

    const client = clientResult as Record<string, any> | null;

    if (!client) {
      return NextResponse.json({
        error: 'Client not found',
        details: `No client exists with ID: ${clientId}`
      }, { status: 404 });
    }

    // Get meal plans
    const mealPlans = await ClientMealPlan.find({ clientId: new mongoose.Types.ObjectId(clientId) })
      .populate('templateId', 'name category')
      .populate('dietitianId', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    // Get ALL payments with full details
    const payments = await UnifiedPayment.find({ client: new mongoose.Types.ObjectId(clientId) })
      .populate('servicePlan', 'name category duration')
      .populate('dietitian', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({
      client,
      mealPlans,
      payments
    });

  } catch (error: any) {
    // Detailed error logging
    console.error('[GET /api/admin/clients/[clientId]] Error:', {
      clientId,
      errorName: error?.name,
      errorMessage: error?.message,
      errorStack: error?.stack?.split('\n').slice(0, 5).join('\n')
    });

    // Handle specific MongoDB errors
    if (error?.name === 'CastError') {
      return NextResponse.json({
        error: 'Invalid client ID',
        details: 'The provided ID is not a valid format'
      }, { status: 400 });
    }

    if (error?.name === 'MongoNetworkError' || error?.name === 'MongoServerSelectionError') {
      return NextResponse.json({
        error: 'Database connection failed',
        details: 'Unable to connect to the database. Please try again.'
      }, { status: 503 });
    }

    return NextResponse.json({
      error: 'Failed to fetch client details',
      details: process.env.NODE_ENV === 'development' ? error?.message : 'An unexpected error occurred'
    }, { status: 500 });
  }
}

// PUT /api/admin/clients/[clientId] - Update client details
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  let clientId: string = '';

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { clientId: rawClientId } = await params;
    clientId = rawClientId;

    // Validate clientId format
    if (!clientId || !isValidObjectId(clientId)) {
      return NextResponse.json({
        error: 'Invalid client ID format',
        details: 'The provided client ID is not a valid MongoDB ObjectId'
      }, { status: 400 });
    }

    const userRole = session.user.role?.toLowerCase();
    const isAdmin = userRole?.includes('admin');
    const isDietitian = userRole === 'dietitian';
    const isHealthCounselor = userRole === 'health-counselor' || userRole === 'healthcounselor' || userRole === 'health_counselor';

    // Check authorization
    if (!isAdmin && !isDietitian && !isHealthCounselor) {
      return NextResponse.json({ error: 'Forbidden - Access denied' }, { status: 403 });
    }

    await connectDB();

    // For non-admin roles, verify they are assigned to this client
    if (!isAdmin) {
      const isAssigned = await isStaffAssignedToClient(session.user.id, clientId);
      if (!isAssigned) {
        return NextResponse.json({ error: 'You are not assigned to this client' }, { status: 403 });
      }
    }

    const body = await request.json();

    // Remove fields that shouldn't be updated directly
    const { password, _id, role, ...updateData } = body;

    // Fetch existing client for change tracking
    const existingClient = await User.findById(clientId).select('-password').lean() as Record<string, any> | null;

    const client = await User.findByIdAndUpdate(
      clientId,
      { $set: updateData },
      { new: true }
    ).select('-password').lean();

    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    // Log activity
    const changedFields = Object.keys(updateData);
    logActivity({
      userId: session.user.id,
      userRole: (userRole as 'admin' | 'dietitian' | 'health_counselor') || 'admin',
      userName: session.user.name || session.user.email || '',
      userEmail: session.user.email || '',
      action: 'Updated Client Details',
      actionType: 'update',
      category: 'profile',
      description: `${roleLabel(userRole)} updated client ${existingClient?.firstName || ''} ${existingClient?.lastName || ''} (${existingClient?.email || clientId}). Fields: ${changedFields.join(', ')}`,
      targetUserId: clientId,
      targetUserName: `${existingClient?.firstName || ''} ${existingClient?.lastName || ''} (${existingClient?.email || ''})`,
      changeDetails: changedFields.map(f => ({
        fieldName: f,
        oldValue: existingClient?.[f] ?? null,
        newValue: updateData[f] ?? null,
      })),
    }).catch(() => { });

    // Clear cache for this client
    clearCacheByTag('admin');

    return NextResponse.json({ client, message: 'Client updated successfully' });

  } catch (error: any) {
    console.error('[PUT /api/admin/clients/[clientId]] Error:', {
      clientId,
      errorName: error?.name,
      errorMessage: error?.message
    });

    if (error?.name === 'CastError') {
      return NextResponse.json({ error: 'Invalid client ID' }, { status: 400 });
    }

    return NextResponse.json({
      error: 'Failed to update client',
      details: process.env.NODE_ENV === 'development' ? error?.message : undefined
    }, { status: 500 });
  }
}

// DELETE /api/admin/clients/[clientId] - Delete or deactivate client
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  let clientId: string = '';

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      console.log('[DELETE Client] No session found');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { clientId: rawClientId } = await params;
    clientId = rawClientId;

    console.log('[DELETE Client] Request received:', {
      clientId,
      userRole: session.user.role,
      userId: session.user.id,
    });

    // Validate clientId format
    if (!clientId || !isValidObjectId(clientId)) {
      console.log('[DELETE Client] Invalid client ID format:', clientId);
      return NextResponse.json({
        error: 'Invalid client ID format',
        details: 'The provided client ID is not a valid MongoDB ObjectId'
      }, { status: 400 });
    }

    const userRole = session.user.role?.toLowerCase();
    if (!userRole || !userRole.includes('admin')) {
      console.log('[DELETE Client] Access denied - not admin. Role:', userRole);
      return NextResponse.json({ error: 'Forbidden - Admin access required', details: `Your role: ${userRole}` }, { status: 403 });
    }

    await connectDB();
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'deactivate'; // 'deactivate' or 'delete'

    console.log('[DELETE Client] Action requested:', action);

    // Fetch client details before delete/deactivate for logging
    const targetClient = await User.findById(clientId).select('firstName lastName email role').lean() as Record<string, any> | null;

    if (!targetClient) {
      console.log('[DELETE Client] Client not found:', clientId);
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    console.log('[DELETE Client] Target client:', {
      id: clientId,
      name: `${targetClient.firstName} ${targetClient.lastName}`,
      email: targetClient.email,
      role: targetClient.role,
    });

    if (action === 'delete') {
      // Permanent delete - use with caution
      console.log('[DELETE Client] Performing permanent delete...');
      const result = await User.findByIdAndDelete(clientId);
      if (!result) {
        console.log('[DELETE Client] findByIdAndDelete returned null');
        return NextResponse.json({ error: 'Client not found or already deleted' }, { status: 404 });
      }
      console.log('[DELETE Client] Client deleted successfully');
      logActivity({
        userId: session.user.id,
        userRole: 'admin',
        userName: session.user.name || session.user.email || '',
        userEmail: session.user.email || '',
        action: 'Deleted Client',
        actionType: 'delete',
        category: 'profile',
        description: `Admin permanently deleted client ${targetClient?.firstName || ''} ${targetClient?.lastName || ''} (${targetClient?.email || clientId}).`,
        targetUserId: clientId,
        targetUserName: `${targetClient?.firstName || ''} ${targetClient?.lastName || ''} (${targetClient?.email || ''})`,
      }).catch((err) => console.error('[DELETE Client] Activity log error:', err));
      clearCacheByTag('admin');
      return NextResponse.json({ message: 'Client deleted permanently', success: true });
    } else {
      // Deactivate (soft delete)
      const client = await User.findByIdAndUpdate(
        clientId,
        { status: 'inactive' },
        { new: true }
      ).select('-password').lean();

      if (!client) {
        return NextResponse.json({ error: 'Client not found' }, { status: 404 });
      }

      logActivity({
        userId: session.user.id,
        userRole: 'admin',
        userName: session.user.name || session.user.email || '',
        userEmail: session.user.email || '',
        action: 'Deactivated Client',
        actionType: 'update',
        category: 'profile',
        description: `Admin deactivated client ${targetClient?.firstName || ''} ${targetClient?.lastName || ''} (${targetClient?.email || clientId}).`,
        targetUserId: clientId,
        targetUserName: `${targetClient?.firstName || ''} ${targetClient?.lastName || ''} (${targetClient?.email || ''})`,
        changeDetails: [{ fieldName: 'status', oldValue: 'active', newValue: 'inactive' }],
      }).catch(() => { });
      clearCacheByTag('admin');
      return NextResponse.json({ client, message: 'Client deactivated successfully' });
    }

  } catch (error: any) {
    console.error('[DELETE /api/admin/clients/[clientId]] Error:', {
      clientId,
      errorName: error?.name,
      errorMessage: error?.message
    });

    if (error?.name === 'CastError') {
      return NextResponse.json({ error: 'Invalid client ID' }, { status: 400 });
    }

    return NextResponse.json({
      error: 'Failed to process request',
      details: process.env.NODE_ENV === 'development' ? error?.message : undefined
    }, { status: 500 });
  }
}
