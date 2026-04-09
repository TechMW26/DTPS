import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import User from '@/lib/db/models/User';
import { checkPermission } from '@/lib/permissions/check';
import { PermissionKey } from '@/lib/db/models/Permission';
import { UserRole } from '@/types';
import { socketManager } from '@/lib/realtime/socket-manager';
import { clearCacheByTag } from '@/lib/api/utils';
import { logActivity } from '@/lib/utils/activityLogger';

// PATCH /api/clients/[clientId]/assign - Assign dietitian/health counselor to client
// Permission-based - any role with proper permission can use this
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ clientId: string }> }
) {
    try {
        const { clientId } = await params;

        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = session.user.id;
        const userRole = session.user.role as UserRole;

        await connectDB();

        const body = await request.json();
        const {
            dietitianId,
            healthCounselorId,
            healthCounselorIds,
            mode,
            dietitianIds,
            // New fields for explicit primary/secondary assignment (same as admin)
            primaryDietitianId,
            secondaryDietitianIds,
            primaryHealthCounselorId,
            secondaryHealthCounselorIds
        } = body;
        const assignAction = mode || 'add';

        // Check permissions based on what user is trying to do
        let hasPermission = false;
        let permissionError = '';

        // Admin always has permission
        if (userRole === UserRole.ADMIN) {
            hasPermission = true;
        } else {
            // Check specific permissions
            if (dietitianId !== undefined || (dietitianIds && dietitianIds.length > 0) || primaryDietitianId !== undefined || (secondaryDietitianIds && secondaryDietitianIds.length > 0)) {
                const result = await checkPermission(userId, userRole, PermissionKey.ASSIGN_CLIENTS_TO_DIETITIANS);
                if (!result.hasPermission) {
                    permissionError = 'You do not have permission to assign clients to dietitians';
                } else {
                    hasPermission = true;
                }
            }

            if (healthCounselorId !== undefined || (healthCounselorIds && healthCounselorIds.length > 0) || primaryHealthCounselorId !== undefined || (secondaryHealthCounselorIds && secondaryHealthCounselorIds.length > 0)) {
                const result = await checkPermission(userId, userRole, PermissionKey.ASSIGN_CLIENTS_TO_HEALTH_COUNSELORS);
                if (!result.hasPermission) {
                    permissionError = permissionError || 'You do not have permission to assign clients to health counselors';
                } else {
                    hasPermission = true;
                }
            }
        }

        if (!hasPermission) {
            return NextResponse.json({
                error: permissionError || 'Permission denied',
            }, { status: 403 });
        }

        // Validate client exists and is a client
        const client = await User.findById(clientId);
        if (!client) {
            return NextResponse.json({ error: 'Client not found' }, { status: 404 });
        }
        if (client.role !== UserRole.CLIENT) {
            return NextResponse.json({ error: 'User is not a client' }, { status: 400 });
        }

        // For non-admin users, verify the client is assigned to them
        if (userRole !== UserRole.ADMIN) {
            const isAssignedToUser =
                client.assignedDietitian?.toString() === userId ||
                client.assignedDietitians?.some((d: any) => d.toString() === userId) ||
                client.assignedHealthCounselor?.toString() === userId ||
                client.assignedHealthCounselors?.some((h: any) => h.toString() === userId);

            if (!isAssignedToUser) {
                return NextResponse.json({
                    error: 'You can only modify assignments for clients assigned to you'
                }, { status: 403 });
            }
        }

        // ===== Health Counselor: Full dietitian assignment capability =====
        // Health Counselors can now assign both primary (assignedDietitian) and 
        // secondary (assignedDietitians) dietitians, same as admin.

        // Build update object
        const setFields: any = {};
        const addToSetFields: any = {};
        const pullFields: any = {};

        // Handle health counselor assignments
        if (healthCounselorIds && Array.isArray(healthCounselorIds)) {
            const validHealthCounselorIds = [];
            for (const hcId of healthCounselorIds) {
                if (hcId && hcId.trim() !== '') {
                    const hc = await User.findById(hcId);
                    if (!hc || hc.role !== UserRole.HEALTH_COUNSELOR) {
                        return NextResponse.json({ error: `Invalid health counselor: ${hcId}` }, { status: 400 });
                    }
                    validHealthCounselorIds.push(hcId);
                }
            }

            if (validHealthCounselorIds.length > 0) {
                if (assignAction === 'add') {
                    addToSetFields.assignedHealthCounselors = { $each: validHealthCounselorIds };
                    if (!client.assignedHealthCounselor) {
                        setFields.assignedHealthCounselor = validHealthCounselorIds[0];
                    }
                } else if (assignAction === 'replace') {
                    setFields.assignedHealthCounselor = validHealthCounselorIds[0];
                    setFields.assignedHealthCounselors = validHealthCounselorIds;
                }
            }
        } else if (healthCounselorId !== undefined) {
            if (assignAction === 'remove' && healthCounselorId) {
                pullFields.assignedHealthCounselors = healthCounselorId;
                if (client.assignedHealthCounselor?.toString() === healthCounselorId) {
                    const remainingHCs = client.assignedHealthCounselors?.filter(
                        (h: any) => h.toString() !== healthCounselorId
                    ) || [];
                    setFields.assignedHealthCounselor = remainingHCs.length > 0 ? remainingHCs[0] : null;
                }
            } else if (healthCounselorId && typeof healthCounselorId === 'string' && healthCounselorId.trim() !== '') {
                const hc = await User.findById(healthCounselorId);
                if (!hc || hc.role !== UserRole.HEALTH_COUNSELOR) {
                    return NextResponse.json({ error: 'Invalid health counselor' }, { status: 400 });
                }
                if (assignAction === 'add') {
                    addToSetFields.assignedHealthCounselors = healthCounselorId;
                    if (!client.assignedHealthCounselor) {
                        setFields.assignedHealthCounselor = healthCounselorId;
                    }
                } else {
                    setFields.assignedHealthCounselor = healthCounselorId;
                    setFields.assignedHealthCounselors = [healthCounselorId];
                }
            }
        }

        // Handle dietitian assignments
        if (dietitianIds && Array.isArray(dietitianIds) && dietitianIds.length > 0) {
            const validDietitianIds = [];
            for (const dId of dietitianIds) {
                const dietitian = await User.findById(dId);
                if (dietitian && dietitian.role === UserRole.DIETITIAN) {
                    validDietitianIds.push(dId);
                }
            }
            if (validDietitianIds.length > 0) {
                if (assignAction === 'add') {
                    addToSetFields.assignedDietitians = { $each: validDietitianIds };
                    if (!client.assignedDietitian) {
                        setFields.assignedDietitian = validDietitianIds[0];
                    }
                } else if (assignAction === 'replace') {
                    setFields.assignedDietitian = validDietitianIds[0];
                    setFields.assignedDietitians = validDietitianIds;
                }
            }
        } else if (dietitianId !== undefined) {
            if (assignAction === 'remove' && dietitianId) {
                pullFields.assignedDietitians = dietitianId;
                if (client.assignedDietitian?.toString() === dietitianId) {
                    const remainingDietitians = client.assignedDietitians?.filter(
                        (d: any) => d.toString() !== dietitianId
                    ) || [];
                    setFields.assignedDietitian = remainingDietitians.length > 0 ? remainingDietitians[0] : null;
                }
            } else if (dietitianId && typeof dietitianId === 'string' && dietitianId.trim() !== '') {
                const dietitian = await User.findById(dietitianId);
                if (!dietitian || dietitian.role !== UserRole.DIETITIAN) {
                    return NextResponse.json({ error: 'Invalid dietitian' }, { status: 400 });
                }
                if (assignAction === 'add') {
                    addToSetFields.assignedDietitians = dietitianId;
                    if (!client.assignedDietitian) {
                        setFields.assignedDietitian = dietitianId;
                    }
                } else {
                    setFields.assignedDietitian = dietitianId;
                    setFields.assignedDietitians = [dietitianId];
                }
            }
        }

        // ===== Handle primary_secondary mode (explicit primary and secondary assignment) =====
        // This mode is used by both admin and health counselors for precise control
        if (assignAction === 'primary_secondary') {
            // Handle primary dietitian
            if (primaryDietitianId !== undefined) {
                if (primaryDietitianId === null || primaryDietitianId === '') {
                    setFields.assignedDietitian = null;
                } else {
                    const dietitian = await User.findById(primaryDietitianId);
                    if (!dietitian || dietitian.role !== UserRole.DIETITIAN) {
                        return NextResponse.json({ error: 'Invalid primary dietitian' }, { status: 400 });
                    }
                    setFields.assignedDietitian = primaryDietitianId;
                }
            }

            // Handle secondary dietitians - CRITICAL: Exclude primary from secondary list
            if (secondaryDietitianIds !== undefined) {
                const validSecondaryIds: string[] = [];
                for (const dId of secondaryDietitianIds || []) {
                    // Skip if this is the primary dietitian (prevent overlap)
                    if (dId === primaryDietitianId) {
                        console.log(`[ASSIGN] Skipping ${dId} from secondary - already primary`);
                        continue;
                    }
                    if (dId && dId.trim() !== '') {
                        const dietitian = await User.findById(dId);
                        if (!dietitian || dietitian.role !== UserRole.DIETITIAN) {
                            return NextResponse.json({ error: `Invalid secondary dietitian: ${dId}` }, { status: 400 });
                        }
                        validSecondaryIds.push(dId);
                    }
                }
                // Build assignedDietitians array: primary first (if set), then secondaries
                // Primary is stored separately in assignedDietitian, but also included in assignedDietitians
                const allDietitianIds = primaryDietitianId && primaryDietitianId !== ''
                    ? [primaryDietitianId, ...validSecondaryIds]
                    : validSecondaryIds;
                setFields.assignedDietitians = allDietitianIds;
            } else if (primaryDietitianId !== undefined) {
                // If only primary is set (no secondary provided), set assignedDietitians to just primary
                setFields.assignedDietitians = primaryDietitianId ? [primaryDietitianId] : [];
            }

            // Handle primary health counselor
            if (primaryHealthCounselorId !== undefined) {
                if (primaryHealthCounselorId === null || primaryHealthCounselorId === '') {
                    setFields.assignedHealthCounselor = null;
                } else {
                    const hc = await User.findById(primaryHealthCounselorId);
                    if (!hc || hc.role !== UserRole.HEALTH_COUNSELOR) {
                        return NextResponse.json({ error: 'Invalid primary health counselor' }, { status: 400 });
                    }
                    setFields.assignedHealthCounselor = primaryHealthCounselorId;
                }
            }

            // Handle secondary health counselors
            if (secondaryHealthCounselorIds !== undefined) {
                const validSecondaryHCIds: string[] = [];
                for (const hcId of secondaryHealthCounselorIds || []) {
                    if (hcId && hcId.trim() !== '') {
                        const hc = await User.findById(hcId);
                        if (!hc || hc.role !== UserRole.HEALTH_COUNSELOR) {
                            return NextResponse.json({ error: `Invalid secondary health counselor: ${hcId}` }, { status: 400 });
                        }
                        validSecondaryHCIds.push(hcId);
                    }
                }
                // Include primary in the assignedHealthCounselors array if set
                const allHCIds = primaryHealthCounselorId && primaryHealthCounselorId !== ''
                    ? [primaryHealthCounselorId, ...validSecondaryHCIds.filter(id => id !== primaryHealthCounselorId)]
                    : validSecondaryHCIds;
                setFields.assignedHealthCounselors = allHCIds;
            }
        }

        // Build and execute update
        const updateOps: any = {};
        if (Object.keys(setFields).length > 0) {
            updateOps.$set = setFields;
        }
        if (Object.keys(addToSetFields).length > 0) {
            updateOps.$addToSet = addToSetFields;
        }
        if (Object.keys(pullFields).length > 0) {
            updateOps.$pull = pullFields;
        }

        if (Object.keys(updateOps).length === 0) {
            return NextResponse.json({ error: 'No valid assignment changes provided' }, { status: 400 });
        }

        await User.findByIdAndUpdate(clientId, updateOps);

        // Fetch updated client with populated fields
        const updatedClient = await User.findById(clientId)
            .populate('assignedDietitian', 'firstName lastName email avatar')
            .populate('assignedDietitians', 'firstName lastName email avatar')
            .populate('assignedHealthCounselor', 'firstName lastName email avatar')
            .populate('assignedHealthCounselors', 'firstName lastName email avatar')
            .lean();

        // Emit Socket.io update
        try {
            socketManager.broadcastClientUpdate('client_updated', {
                clientId,
                action: 'assignment_updated'
            });
        } catch (socketError) {
            console.error('Error emitting socket event:', socketError);
        }

        // Clear cache
        try {
            await clearCacheByTag('clients');
        } catch (cacheError) {
            console.error('Error clearing cache:', cacheError);
        }

        return NextResponse.json({
            success: true,
            message: 'Assignment updated successfully',
            client: updatedClient,
        });
    } catch (error) {
        console.error('Error updating assignment:', error);
        return NextResponse.json(
            { error: 'Failed to update assignment' },
            { status: 500 }
        );
    }
}

// GET /api/clients/[clientId]/assign - Get available staff for assignment
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ clientId: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = session.user.id;
        const userRole = session.user.role as UserRole;

        await connectDB();

        // Check if user has any assignment permission
        const canAssignDietitians = userRole === UserRole.ADMIN ||
            (await checkPermission(userId, userRole, PermissionKey.ASSIGN_CLIENTS_TO_DIETITIANS)).hasPermission;
        const canAssignHealthCounselors = userRole === UserRole.ADMIN ||
            (await checkPermission(userId, userRole, PermissionKey.ASSIGN_CLIENTS_TO_HEALTH_COUNSELORS)).hasPermission;

        if (!canAssignDietitians && !canAssignHealthCounselors) {
            return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
        }

        const result: any = {
            permissions: {
                canAssignDietitians,
                canAssignHealthCounselors,
            },
        };

        const { clientId } = await params;

        // Fetch available staff based on permissions
        if (canAssignDietitians) {
            const dietitians = await User.find({
                role: UserRole.DIETITIAN,
                status: 'active',
            })
                .select('firstName lastName email avatar phone')
                .lean();

            // Health Counselors now have full access to assign primary and secondary dietitians
            // Mark each dietitian with their current assignment status
            if (userRole === UserRole.HEALTH_COUNSELOR) {
                const clientDoc = await User.findById(clientId)
                    .select('assignedDietitian assignedDietitians')
                    .lean() as any;

                const primaryDietitianId = clientDoc?.assignedDietitian?.toString() || null;
                const secondaryDietitianIds = (clientDoc?.assignedDietitians || []).map((d: any) => d.toString());

                // Mark each dietitian as primary/secondary/unassigned
                result.dietitians = dietitians.map((d: any) => ({
                    ...d,
                    isPrimary: d._id.toString() === primaryDietitianId,
                    isSecondary: secondaryDietitianIds.includes(d._id.toString()),
                }));
                // HC now has full primary/secondary assignment capability
                result.primaryDietitianOnly = false;
            } else {
                result.dietitians = dietitians;
            }
        }

        if (canAssignHealthCounselors) {
            const healthCounselors = await User.find({
                role: UserRole.HEALTH_COUNSELOR,
                status: 'active',
            })
                .select('firstName lastName email avatar phone')
                .lean();
            result.healthCounselors = healthCounselors;
        }

        return NextResponse.json(result);
    } catch (error) {
        console.error('Error fetching staff:', error);
        return NextResponse.json(
            { error: 'Failed to fetch staff' },
            { status: 500 }
        );
    }
}
