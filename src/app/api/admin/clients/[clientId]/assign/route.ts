import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import User from '@/lib/db/models/User';
import UnifiedPayment from '@/lib/db/models/UnifiedPayment';
import { UserRole } from '@/types';
import { logActivity } from '@/lib/utils/activityLogger';
import { socketManager } from '@/lib/realtime/socket-manager';
import { clearCacheByTag } from '@/lib/api/utils';
import { buildAssignmentSnapshot, notifyAssignmentChanges } from '@/lib/notifications/staffPushService';

// PATCH /api/admin/clients/[clientId]/assign - Assign/Add dietitian to client
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const [session, , { clientId }, body] = await Promise.all([
      getServerSession(authOptions),
      connectDB(),
      params,
      request.json(),
    ]);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user has admin role (case-insensitive and flexible)
    const userRole = session.user.role?.toLowerCase();

    if (!userRole || (!userRole.includes('admin') && userRole !== 'admin')) {
      return NextResponse.json({
        error: 'Forbidden - Admin access required',
        userRole: session.user.role
      }, { status: 403 });
    }

    const {
      dietitianId,
      healthCounselorId,
      healthCounselorIds,
      action,
      mode,
      dietitianIds,
      // New fields for explicit primary/secondary assignment
      primaryDietitianId,
      secondaryDietitianIds,
      primaryHealthCounselorId,
      secondaryHealthCounselorIds
    } = body;
    // Support both 'action' and 'mode' for backwards compatibility
    const assignAction = action || mode || 'replace';

    // Validate client exists and is a client
    const client = await User.findById(clientId);
    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }
    if (client.role !== UserRole.CLIENT) {
      return NextResponse.json({ error: 'User is not a client' }, { status: 400 });
    }

    const beforeAssignmentSnapshot = buildAssignmentSnapshot(client.toObject());

    // ========== NEW: Handle explicit primary/secondary mode ==========
    if (assignAction === 'primary_secondary') {
      const updateData: any = {};

      // Handle Dietitian assignments
      // Primary dietitian -> assignedDietitian field
      if (primaryDietitianId) {
        const primaryDietitian = await User.findById(primaryDietitianId);
        if (!primaryDietitian || primaryDietitian.role !== UserRole.DIETITIAN) {
          return NextResponse.json({ error: 'Invalid primary dietitian' }, { status: 400 });
        }
        updateData.assignedDietitian = primaryDietitianId;
      } else {
        updateData.assignedDietitian = null;
      }

      // Build assignedDietitians array: ONLY secondaries (primary is separate in assignedDietitian)
      const allDietitianIds: string[] = [];
      if (secondaryDietitianIds && Array.isArray(secondaryDietitianIds)) {
        const filteredIds = secondaryDietitianIds.filter((sdId: string) => sdId && sdId !== primaryDietitianId);
        if (filteredIds.length > 0) {
          const validDietitians = await User.find({ _id: { $in: filteredIds }, role: UserRole.DIETITIAN }).select('_id').lean();
          for (const d of validDietitians) {
            allDietitianIds.push(d._id.toString());
          }
        }
      }
      updateData.assignedDietitians = allDietitianIds;

      // Handle Health Counselor assignments
      // Primary health counselor -> assignedHealthCounselor field
      if (primaryHealthCounselorId) {
        const primaryHC = await User.findById(primaryHealthCounselorId);
        if (!primaryHC || primaryHC.role !== UserRole.HEALTH_COUNSELOR) {
          return NextResponse.json({ error: 'Invalid primary health counselor' }, { status: 400 });
        }
        updateData.assignedHealthCounselor = primaryHealthCounselorId;
      } else {
        updateData.assignedHealthCounselor = null;
      }

      // Build assignedHealthCounselors array: ONLY secondaries (primary is separate in assignedHealthCounselor)
      const allHCIds: string[] = [];
      if (secondaryHealthCounselorIds && Array.isArray(secondaryHealthCounselorIds)) {
        const filteredHCIds = secondaryHealthCounselorIds.filter((shcId: string) => shcId && shcId !== primaryHealthCounselorId);
        if (filteredHCIds.length > 0) {
          const validHCs = await User.find({ _id: { $in: filteredHCIds }, role: UserRole.HEALTH_COUNSELOR }).select('_id').lean();
          for (const hc of validHCs) {
            allHCIds.push(hc._id.toString());
          }
        }
      }
      updateData.assignedHealthCounselors = allHCIds;

      // Update the client
      const updatedClient = await User.findByIdAndUpdate(
        clientId,
        { $set: updateData },
        { new: true }
      );

      // Sync dietitian assignment to UnifiedPayment records
      if (updatedClient.assignedDietitian) {
        await UnifiedPayment.updateMany(
          {
            client: updatedClient._id,
            status: { $in: ['active', 'pending', 'on_hold', 'paid'] }
          },
          { $set: { dietitian: updatedClient.assignedDietitian } }
        );
      }

      // Populate the assigned professionals
      await updatedClient.populate('assignedDietitian', 'firstName lastName email avatar');
      await updatedClient.populate('assignedDietitians', 'firstName lastName email avatar');
      await updatedClient.populate('assignedHealthCounselor', 'firstName lastName email avatar');
      await updatedClient.populate('assignedHealthCounselors', 'firstName lastName email avatar');

      try {
        const afterAssignmentSnapshot = buildAssignmentSnapshot(updatedClient.toObject());
        const clientName = `${updatedClient.firstName || ''} ${updatedClient.lastName || ''}`.trim() || 'Client';
        await notifyAssignmentChanges({
          clientId,
          clientName,
          before: beforeAssignmentSnapshot,
          after: afterAssignmentSnapshot,
        });
      } catch (notificationError) {
        console.error('Error sending admin assignment notifications:', notificationError);
      }

      // Log activity
      await logActivity({
        userId: session.user.id,
        userRole: session.user.role as any,
        userName: session.user.name || 'Unknown',
        userEmail: session.user.email || '',
        action: 'Client Professional Assignments Updated',
        actionType: 'assign',
        category: 'client_assignment',
        description: `Updated assignments for ${updatedClient.firstName} ${updatedClient.lastName}: ${allDietitianIds.length} dietitian(s), ${allHCIds.length} health counselor(s)`,
        targetUserId: clientId,
        targetUserName: `${updatedClient.firstName} ${updatedClient.lastName}`,
        details: { primaryDietitianId, secondaryDietitianIds, primaryHealthCounselorId, secondaryHealthCounselorIds }
      });

      // Broadcast real-time update
      const [total, assignedCount, unassignedCount] = await Promise.all([
        User.countDocuments({ role: UserRole.CLIENT }),
        User.countDocuments({
          role: UserRole.CLIENT,
          $or: [
            { assignedDietitian: { $ne: null } },
            { assignedDietitians: { $exists: true, $not: { $size: 0 } } }
          ]
        }),
        User.countDocuments({
          role: UserRole.CLIENT,
          assignedDietitian: null,
          $or: [
            { assignedDietitians: { $exists: false } },
            { assignedDietitians: { $size: 0 } }
          ]
        }),
      ]);

      socketManager.broadcastClientUpdate('client_updated', {
        client: updatedClient.toObject(),
        action: 'primary_secondary',
        stats: { total, assigned: assignedCount, unassigned: unassignedCount },
        timestamp: Date.now()
      });

      // Clear cache
      clearCacheByTag('clients');
      clearCacheByTag('stats');
      clearCacheByTag('admin');
      clearCacheByTag('users');
      clearCacheByTag('dashboard');

      return NextResponse.json({
        success: true,
        message: 'Professional assignments saved successfully',
        client: updatedClient
      });
    }

    // ========== Original logic for other modes ==========
    // Build update object for MongoDB
    // We need to separate direct field updates ($set) from array operators ($addToSet, $pull)
    const setFields: any = {};
    const addToSetFields: any = {};
    const pullFields: any = {};

    // Handle multiple health counselors assignment
    if (healthCounselorIds && Array.isArray(healthCounselorIds)) {
      // Validate all health counselors
      const validHealthCounselorIds = [];
      for (const hcId of healthCounselorIds) {
        if (hcId && hcId.trim() !== '') {
          const hc = await User.findById(hcId);
          if (!hc) {
            return NextResponse.json({ error: `Health counselor ${hcId} not found` }, { status: 404 });
          }
          if (hc.role !== UserRole.HEALTH_COUNSELOR) {
            return NextResponse.json({ error: `User ${hcId} is not a health counselor` }, { status: 400 });
          }
          validHealthCounselorIds.push(hcId);
        }
      }

      if (validHealthCounselorIds.length > 0) {
        if (assignAction === 'add') {
          // Add to existing health counselors
          addToSetFields.assignedHealthCounselors = { $each: validHealthCounselorIds };
          // Set primary if not already set
          if (!client.assignedHealthCounselor) {
            setFields.assignedHealthCounselor = validHealthCounselorIds[0];
          }
        } else {
          // Replace mode: Set primary and array
          setFields.assignedHealthCounselor = validHealthCounselorIds[0];
          setFields.assignedHealthCounselors = validHealthCounselorIds;
        }
      }
    } else if (healthCounselorId !== undefined) {
      // Handle single health counselor assignment (legacy) or removal
      // healthCounselorId can be: string, object { id, action }, null, or empty string

      // Check if it's an object with action (e.g., { id: '...', action: 'remove' })
      if (healthCounselorId && typeof healthCounselorId === 'object' && healthCounselorId.id) {
        const hcId = healthCounselorId.id;
        const hcAction = healthCounselorId.action;

        if (hcAction === 'remove') {
          // Remove specific health counselor from array
          pullFields.assignedHealthCounselors = hcId;
          // If removing the primary, set a new primary
          if (client.assignedHealthCounselor?.toString() === hcId) {
            const remainingHCs = client.assignedHealthCounselors?.filter(
              (h: any) => h.toString() !== hcId
            ) || [];
            setFields.assignedHealthCounselor = remainingHCs.length > 0 ? remainingHCs[0] : null;
          }
        } else {
          // Add single health counselor
          const healthCounselor = await User.findById(hcId);
          if (!healthCounselor) {
            return NextResponse.json({ error: 'Health counselor not found' }, { status: 404 });
          }
          if (healthCounselor.role !== UserRole.HEALTH_COUNSELOR) {
            return NextResponse.json({ error: 'User is not a health counselor' }, { status: 400 });
          }
          setFields.assignedHealthCounselor = hcId;
          setFields.assignedHealthCounselors = [hcId];
        }
      } else if (healthCounselorId && typeof healthCounselorId === 'string' && healthCounselorId.trim() !== '') {
        if (assignAction === 'remove') {
          // Remove specific health counselor (string id)
          pullFields.assignedHealthCounselors = healthCounselorId;
          if (client.assignedHealthCounselor?.toString() === healthCounselorId) {
            const remainingHCs = client.assignedHealthCounselors?.filter(
              (h: any) => h.toString() !== healthCounselorId
            ) || [];
            setFields.assignedHealthCounselor = remainingHCs.length > 0 ? remainingHCs[0] : null;
          }
        } else {
          // Legacy: string ID for single assignment
          const healthCounselor = await User.findById(healthCounselorId);
          if (!healthCounselor) {
            return NextResponse.json({ error: 'Health counselor not found' }, { status: 404 });
          }
          if (healthCounselor.role !== UserRole.HEALTH_COUNSELOR) {
            return NextResponse.json({ error: 'User is not a health counselor' }, { status: 400 });
          }
          setFields.assignedHealthCounselor = healthCounselorId;
          setFields.assignedHealthCounselors = [healthCounselorId];
        }
      } else {
        // Unassign health counselor if empty string or null
        setFields.assignedHealthCounselor = null;
        setFields.assignedHealthCounselors = [];
      }
    }

    // Handle different actions for dietitians (only when dietitian input is provided)
    const hasDietitianInput =
      dietitianId !== undefined ||
      (Array.isArray(dietitianIds) && dietitianIds.length > 0) ||
      assignAction === 'transfer';

    if (hasDietitianInput && assignAction === 'add' && dietitianIds && Array.isArray(dietitianIds)) {
      // Validate and add multiple dietitians
      const validDietitianIds = [];
      for (const dId of dietitianIds) {
        const dietitian = await User.findById(dId);
        if (dietitian && dietitian.role === UserRole.DIETITIAN) {
          validDietitianIds.push(dId);
        }
      }
      if (validDietitianIds.length > 0) {
        addToSetFields.assignedDietitians = { $each: validDietitianIds };
        if (!client.assignedDietitian) {
          setFields.assignedDietitian = validDietitianIds[0];
        }
      }
    } else if (hasDietitianInput && assignAction === 'add' && dietitianId) {
      // Add single dietitian
      const dietitian = await User.findById(dietitianId);
      if (!dietitian) {
        return NextResponse.json({ error: 'Dietitian not found' }, { status: 404 });
      }
      if (dietitian.role !== UserRole.DIETITIAN) {
        return NextResponse.json({ error: 'User is not a dietitian' }, { status: 400 });
      }
      addToSetFields.assignedDietitians = dietitianId;
      if (!client.assignedDietitian) {
        setFields.assignedDietitian = dietitianId;
      }
    } else if (hasDietitianInput && assignAction === 'remove' && dietitianId) {
      // Remove dietitian from array
      pullFields.assignedDietitians = dietitianId;
      // If removing the primary, set a new primary
      if (client.assignedDietitian?.toString() === dietitianId) {
        const remainingDietitians = client.assignedDietitians?.filter(
          (d: any) => d.toString() !== dietitianId
        ) || [];
        setFields.assignedDietitian = remainingDietitians.length > 0 ? remainingDietitians[0] : null;
      }
    } else if (hasDietitianInput && assignAction === 'transfer' && dietitianId) {
      // Transfer to new primary dietitian
      const dietitian = await User.findById(dietitianId);
      if (!dietitian) {
        return NextResponse.json({ error: 'Dietitian not found' }, { status: 404 });
      }
      if (dietitian.role !== UserRole.DIETITIAN) {
        return NextResponse.json({ error: 'User is not a dietitian' }, { status: 400 });
      }

      // Add current primary to the array if not already there (for history)
      if (client.assignedDietitian) {
        addToSetFields.assignedDietitians = client.assignedDietitian;
      } else {
        addToSetFields.assignedDietitians = dietitianId;
      }

      // Set new primary
      setFields.assignedDietitian = dietitianId;
    } else if (hasDietitianInput) {
      // Default: Replace primary dietitian
      if (dietitianId) {
        const dietitian = await User.findById(dietitianId);
        if (!dietitian) {
          return NextResponse.json({ error: 'Dietitian not found' }, { status: 404 });
        }
        if (dietitian.role !== UserRole.DIETITIAN) {
          return NextResponse.json({ error: 'User is not a dietitian' }, { status: 400 });
        }
        setFields.assignedDietitian = dietitianId;
        addToSetFields.assignedDietitians = dietitianId;
      } else {
        setFields.assignedDietitian = null;
      }
    }

    // Build the final update object with proper MongoDB operators
    const updateObj: any = {};
    if (Object.keys(setFields).length > 0) {
      updateObj.$set = setFields;
    }
    if (Object.keys(addToSetFields).length > 0) {
      updateObj.$addToSet = addToSetFields;
    }
    if (Object.keys(pullFields).length > 0) {
      updateObj.$pull = pullFields;
    }

    // Update client using findByIdAndUpdate with proper operators
    const updatedClient = await User.findByIdAndUpdate(
      clientId,
      updateObj,
      { new: true }
    );

    // Sync dietitian assignment to UnifiedPayment records
    // This ensures the user dashboard shows correct dietitian status
    const dietitianToSync = updatedClient.assignedDietitian;
    if (dietitianToSync) {
      // Update all active purchases for this client with the assigned dietitian
      await UnifiedPayment.updateMany(
        {
          client: updatedClient._id,
          status: { $in: ['active', 'pending', 'on_hold', 'paid'] }
        },
        {
          $set: { dietitian: dietitianToSync }
        }
      );
    }

    // Populate the assigned dietitian and health counselor info
    await updatedClient.populate('assignedDietitian', 'firstName lastName email avatar');
    await updatedClient.populate('assignedDietitians', 'firstName lastName email avatar');
    await updatedClient.populate('assignedHealthCounselor', 'firstName lastName email avatar');
    await updatedClient.populate('assignedHealthCounselors', 'firstName lastName email avatar');

    try {
      const afterAssignmentSnapshot = buildAssignmentSnapshot(updatedClient.toObject());
      const clientName = `${updatedClient.firstName || ''} ${updatedClient.lastName || ''}`.trim() || 'Client';
      await notifyAssignmentChanges({
        clientId,
        clientName,
        before: beforeAssignmentSnapshot,
        after: afterAssignmentSnapshot,
      });
    } catch (notificationError) {
      console.error('Error sending admin assignment notifications:', notificationError);
    }

    const actionMessages: Record<string, string> = {
      'add': 'Professional(s) added successfully',
      'remove': 'Professional removed successfully',
      'transfer': 'Client transferred successfully',
      'replace': dietitianId ? 'Professional(s) assigned successfully' : 'Professional unassigned successfully'
    };

    // Build success message including HC if assigned
    let successMessage = actionMessages[assignAction] || 'Assignment updated successfully';
    if (healthCounselorIds && healthCounselorIds.length > 0) {
      const hcCount = healthCounselorIds.length;
      successMessage = assignAction === 'add'
        ? `Added ${hcCount} health counselor${hcCount > 1 ? 's' : ''} successfully`
        : `Assigned ${hcCount} health counselor${hcCount > 1 ? 's' : ''} successfully`;
      if (dietitianId) {
        successMessage += ' and dietitian updated';
      }
    } else if (typeof healthCounselorId === 'string' && healthCounselorId.trim() !== '') {
      successMessage += ' and Health Counselor assigned successfully';
    }

    // Log activity
    const dietitianInfo = await User.findById(dietitianId || updatedClient.assignedDietitian);
    await logActivity({
      userId: session.user.id,
      userRole: session.user.role as any,
      userName: session.user.name || 'Unknown',
      userEmail: session.user.email || '',
      action: `Client ${assignAction === 'add' ? 'Assigned' : assignAction === 'remove' ? 'Unassigned' : 'Transferred'} to Dietitian`,
      actionType: 'assign',
      category: 'client_assignment',
      description: `${assignAction === 'add' ? 'Assigned' : assignAction === 'remove' ? 'Removed' : 'Transferred'} ${updatedClient.firstName} ${updatedClient.lastName} ${dietitianInfo ? `${assignAction === 'remove' ? 'from' : 'to'} ${dietitianInfo.firstName} ${dietitianInfo.lastName}` : ''}`,
      targetUserId: clientId,
      targetUserName: `${updatedClient.firstName} ${updatedClient.lastName}`,
      details: { dietitianId, action: assignAction }
    });

    // Broadcast real-time update to all admin connections
    // Recalculate stats for the broadcast
    const [total, assignedCount, unassignedCount] = await Promise.all([
      User.countDocuments({ role: UserRole.CLIENT }),
      User.countDocuments({
        role: UserRole.CLIENT,
        $or: [
          { assignedDietitian: { $ne: null } },
          { assignedDietitians: { $exists: true, $not: { $size: 0 } } }
        ]
      }),
      User.countDocuments({
        role: UserRole.CLIENT,
        assignedDietitian: null,
        $or: [
          { assignedDietitians: { $exists: false } },
          { assignedDietitians: { $size: 0 } }
        ]
      }),
    ]);

    socketManager.broadcastClientUpdate('client_updated', {
      client: updatedClient.toObject(),
      action: assignAction,
      stats: {
        total,
        assigned: assignedCount,
        unassigned: unassignedCount
      },
      timestamp: Date.now()
    });

    // Clear cache to refresh client list, user details, and dashboard
    clearCacheByTag('clients');
    clearCacheByTag('stats');
    clearCacheByTag('admin');
    clearCacheByTag('users');
    clearCacheByTag('dashboard');

    return NextResponse.json({
      success: true,
      message: successMessage,
      client: updatedClient
    });

  } catch (error) {
    console.error('Error assigning dietitian:', error);
    return NextResponse.json(
      { error: 'Failed to assign dietitian' },
      { status: 500 }
    );
  }
}
