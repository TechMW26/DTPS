import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import User from '@/lib/db/models/User';
import { UserRole } from '@/types';
import { clearCacheByTag } from '@/lib/api/utils';
import { logActivity } from '@/lib/utils/activityLogger';
import mongoose from 'mongoose';
import { format } from 'date-fns';

// Helper function to validate MongoDB ObjectId
function isValidObjectId(id: string): boolean {
    return mongoose.Types.ObjectId.isValid(id) && new mongoose.Types.ObjectId(id).toString() === id;
}

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
    return map[r.toLowerCase()] ?? r;
}

// Format duration in human-readable format
function formatDuration(ms: number): string {
    if (ms < 0) ms = 0;

    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    const parts: string[] = [];
    if (days > 0) parts.push(`${days} day${days !== 1 ? 's' : ''}`);
    if (hours % 24 > 0) parts.push(`${hours % 24} hour${hours % 24 !== 1 ? 's' : ''}`);
    if (minutes % 60 > 0) parts.push(`${minutes % 60} minute${minutes % 60 !== 1 ? 's' : ''}`);

    return parts.length > 0 ? parts.join(', ') : '0 minutes';
}

// POST /api/admin/clients/[clientId]/hold - Put client on hold
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ clientId: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { clientId } = await params;

        // Validate clientId format
        if (!clientId || !isValidObjectId(clientId)) {
            return NextResponse.json({
                error: 'Invalid client ID format'
            }, { status: 400 });
        }

        // Admin or Dietitian can hold clients
        const userRole = session.user.role?.toLowerCase();
        if (!userRole?.includes('admin') && !userRole?.includes('dietitian')) {
            return NextResponse.json({
                error: 'Forbidden - Only admin or dietitian can put clients on hold'
            }, { status: 403 });
        }

        await connectDB();

        // Get client
        const client = await User.findById(clientId);
        if (!client) {
            return NextResponse.json({ error: 'Client not found' }, { status: 404 });
        }

        if (client.role !== UserRole.CLIENT) {
            return NextResponse.json({ error: 'User is not a client' }, { status: 400 });
        }

        // Check if already on hold
        if (client.holdStatus?.isOnHold) {
            return NextResponse.json({
                error: 'Client is already on hold',
                holdDate: client.holdStatus.holdDate
            }, { status: 400 });
        }

        // Parse optional reason from request body
        let reason = '';
        try {
            const body = await request.json();
            reason = body.reason || '';
        } catch {
            // No body is fine
        }

        const now = new Date();
        const timeStr = format(now, 'HH:mm:ss');

        // Update hold status
        const updateData = {
            'holdStatus.isOnHold': true,
            'holdStatus.holdDate': now,
            'holdStatus.holdTime': timeStr,
            'holdStatus.heldBy': new mongoose.Types.ObjectId(session.user.id),
            // HOLD overrides ACTIVE/INACTIVE immediately (single source of truth)
            clientStatus: 'hold',
            $inc: { 'holdStatus.holdCount': 1 },
            $push: {
                holdStatusHistory: {
                    action: 'hold',
                    performedBy: new mongoose.Types.ObjectId(session.user.id),
                    performedByName: session.user.name || `${session.user.firstName || ''} ${session.user.lastName || ''}`.trim() || 'Unknown',
                    performedByRole: roleLabel(session.user.role),
                    timestamp: now,
                    reason: reason || undefined
                },
                clientStatusHistory: {
                    previousStatus: client.clientStatus || null,
                    newStatus: 'hold',
                    changedBy: session.user.id,
                    isManual: true,
                    trigger: 'hold',
                    relatedEvent: reason || null,
                    timestamp: now
                }
            }
        };

        await User.findByIdAndUpdate(clientId, updateData);

        // Log activity
        await logActivity({
            userId: session.user.id,
            userRole: userRole as 'admin',
            userName: session.user.name || `${session.user.firstName || ''} ${session.user.lastName || ''}`.trim() || 'Unknown',
            userEmail: session.user.email || undefined,
            action: 'Put Client on Hold',
            actionType: 'update',
            category: 'profile',
            description: `Put client "${client.firstName} ${client.lastName}" on hold${reason ? ` - Reason: ${reason}` : ''}`,
            targetUserId: clientId,
            targetUserName: `${client.firstName} ${client.lastName}`,
            resourceId: clientId,
            resourceType: 'client',
            resourceName: `${client.firstName} ${client.lastName}`,
            details: {
                action: 'hold',
                holdDate: now.toISOString(),
                holdTime: timeStr,
                reason: reason || null,
                holdCount: (client.holdStatus?.holdCount || 0) + 1
            }
        });

        // Clear cache
        await clearCacheByTag('admin:clients');
        await clearCacheByTag('client_purchases');
        await clearCacheByTag(`client:${clientId}`);

        // Fetch updated client
        const updatedClient = await User.findById(clientId)
            .select('firstName lastName holdStatus holdStatusHistory')
            .lean();

        return NextResponse.json({
            success: true,
            message: `Client "${client.firstName} ${client.lastName}" has been put on hold`,
            clientStatus: 'hold',
            holdStatus: (updatedClient as any)?.holdStatus,
            holdStatusHistory: (updatedClient as any)?.holdStatusHistory
        });

    } catch (error: any) {
        console.error('[POST /api/admin/clients/[clientId]/hold] Error:', error);
        return NextResponse.json({
            error: 'Failed to put client on hold',
            details: error?.message
        }, { status: 500 });
    }
}

// DELETE /api/admin/clients/[clientId]/hold - Activate (unhold) client
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ clientId: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { clientId } = await params;

        // Validate clientId format
        if (!clientId || !isValidObjectId(clientId)) {
            return NextResponse.json({
                error: 'Invalid client ID format'
            }, { status: 400 });
        }

        // Admin or Dietitian can activate clients
        const userRole = session.user.role?.toLowerCase();
        if (!userRole?.includes('admin') && !userRole?.includes('dietitian')) {
            return NextResponse.json({
                error: 'Forbidden - Only admin or dietitian can activate clients'
            }, { status: 403 });
        }

        await connectDB();

        // Get client
        const client = await User.findById(clientId);
        if (!client) {
            return NextResponse.json({ error: 'Client not found' }, { status: 404 });
        }

        if (client.role !== UserRole.CLIENT) {
            return NextResponse.json({ error: 'User is not a client' }, { status: 400 });
        }

        // Check if not on hold
        if (!client.holdStatus?.isOnHold) {
            return NextResponse.json({
                error: 'Client is not currently on hold'
            }, { status: 400 });
        }

        // Parse optional reason from request body
        let reason = '';
        try {
            const body = await request.json();
            reason = body.reason || '';
        } catch {
            // No body is fine
        }

        const now = new Date();
        const timeStr = format(now, 'HH:mm:ss');

        // Calculate this hold period duration
        const holdStartDate = client.holdStatus.holdDate;
        const holdDurationMs = holdStartDate ? now.getTime() - new Date(holdStartDate).getTime() : 0;
        const previousTotalMs = client.holdStatus.totalHoldDurationMs || 0;
        const newTotalMs = previousTotalMs + holdDurationMs;

        // Update hold status
        const updateData = {
            'holdStatus.isOnHold': false,
            'holdStatus.activatedDate': now,
            'holdStatus.activatedTime': timeStr,
            'holdStatus.activatedBy': new mongoose.Types.ObjectId(session.user.id),
            'holdStatus.totalHoldDurationMs': newTotalMs,
            $push: {
                holdStatusHistory: {
                    action: 'activate',
                    performedBy: new mongoose.Types.ObjectId(session.user.id),
                    performedByName: session.user.name || `${session.user.firstName || ''} ${session.user.lastName || ''}`.trim() || 'Unknown',
                    performedByRole: roleLabel(session.user.role),
                    timestamp: now,
                    reason: reason || undefined,
                    holdDurationMs: holdDurationMs
                }
            }
        };

        await User.findByIdAndUpdate(clientId, updateData);

        // Auto-extend Expected End Date on all eligible client purchases by the
        // exact hold duration (preserves originalExpectedEndDate for audit and
        // supports multiple hold/active cycles).
        let extensionSummary: { extendedCount: number; totalAddedMs: number } = {
            extendedCount: 0,
            totalAddedMs: 0,
        };
        try {
            if (holdStartDate && holdDurationMs > 0) {
                const { applyHoldExtensionToClientPurchases } = await import('@/lib/status/holdExtension');
                const ext = await applyHoldExtensionToClientPurchases({
                    clientId,
                    holdStart: new Date(holdStartDate),
                    holdEnd: now,
                    appliedBy: session.user.id,
                });
                extensionSummary = { extendedCount: ext.extendedCount, totalAddedMs: ext.totalAddedMs };
            }
        } catch (extError) {
            console.error('[Hold DELETE] Failed to extend expected end dates:', extError);
        }

        // Recalculate status now that hold is removed:
        //   today <= Expected End Date → ACTIVE, else INACTIVE (LEAD if no payment).
        let recalculatedStatus = 'lead';
        try {
            const { recalculateAndPersistClientStatus } = await import('@/lib/status/computeClientStatus');
            recalculatedStatus = await recalculateAndPersistClientStatus(clientId, {
                trigger: 'resume',
                changedBy: session.user.id,
                isManual: true,
                relatedEvent: reason || undefined
            });
        } catch (recalcError) {
            console.error('[Hold DELETE] Failed to recalculate status:', recalcError);
        }

        // Log activity
        await logActivity({
            userId: session.user.id,
            userRole: userRole as 'admin',
            userName: session.user.name || `${session.user.firstName || ''} ${session.user.lastName || ''}`.trim() || 'Unknown',
            userEmail: session.user.email || undefined,
            action: 'Activated Client',
            actionType: 'update',
            category: 'profile',
            description: `Activated client "${client.firstName} ${client.lastName}" after ${formatDuration(holdDurationMs)} on hold${reason ? ` - Reason: ${reason}` : ''}`,
            targetUserId: clientId,
            targetUserName: `${client.firstName} ${client.lastName}`,
            resourceId: clientId,
            resourceType: 'client',
            resourceName: `${client.firstName} ${client.lastName}`,
            details: {
                action: 'activate',
                activatedDate: now.toISOString(),
                activatedTime: timeStr,
                reason: reason || null,
                holdDurationMs,
                holdDurationFormatted: formatDuration(holdDurationMs),
                totalHoldDurationMs: newTotalMs,
                totalHoldDurationFormatted: formatDuration(newTotalMs),
                extendedPurchasesCount: extensionSummary.extendedCount,
                extendedTotalMs: extensionSummary.totalAddedMs,
                extendedTotalFormatted: formatDuration(extensionSummary.totalAddedMs)
            }
        });

        // Clear cache
        await clearCacheByTag('admin:clients');

        // Fetch updated client
        const updatedClient = await User.findById(clientId)
            .select('firstName lastName holdStatus holdStatusHistory')
            .lean();

        return NextResponse.json({
            success: true,
            message: `Client "${client.firstName} ${client.lastName}" has been activated`,
            clientStatus: recalculatedStatus,
            holdDuration: formatDuration(holdDurationMs),
            totalHoldDuration: formatDuration(newTotalMs),
            endDateExtension: {
                extendedPurchasesCount: extensionSummary.extendedCount,
                addedMs: extensionSummary.totalAddedMs,
                addedFormatted: formatDuration(extensionSummary.totalAddedMs)
            },
            holdStatus: (updatedClient as any)?.holdStatus,
            holdStatusHistory: (updatedClient as any)?.holdStatusHistory
        });

    } catch (error: any) {
        console.error('[DELETE /api/admin/clients/[clientId]/hold] Error:', error);
        return NextResponse.json({
            error: 'Failed to activate client',
            details: error?.message
        }, { status: 500 });
    }
}

// GET /api/admin/clients/[clientId]/hold - Get hold status and history
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ clientId: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { clientId } = await params;

        // Validate clientId format
        if (!clientId || !isValidObjectId(clientId)) {
            return NextResponse.json({
                error: 'Invalid client ID format'
            }, { status: 400 });
        }

        await connectDB();

        // Get client with hold info
        const client = await User.findById(clientId)
            .select('firstName lastName role holdStatus holdStatusHistory')
            .populate('holdStatus.heldBy', 'firstName lastName')
            .populate('holdStatus.activatedBy', 'firstName lastName')
            .populate('holdStatusHistory.performedBy', 'firstName lastName')
            .lean();

        if (!client) {
            return NextResponse.json({ error: 'Client not found' }, { status: 404 });
        }

        const clientData = client as any;

        // Calculate current hold duration if on hold
        let currentHoldDuration = 0;
        if (clientData.holdStatus?.isOnHold && clientData.holdStatus?.holdDate) {
            currentHoldDuration = Date.now() - new Date(clientData.holdStatus.holdDate).getTime();
        }

        return NextResponse.json({
            isOnHold: clientData.holdStatus?.isOnHold || false,
            holdDate: clientData.holdStatus?.holdDate,
            holdTime: clientData.holdStatus?.holdTime,
            activatedDate: clientData.holdStatus?.activatedDate,
            activatedTime: clientData.holdStatus?.activatedTime,
            totalHoldDurationMs: clientData.holdStatus?.totalHoldDurationMs || 0,
            totalHoldDuration: formatDuration(clientData.holdStatus?.totalHoldDurationMs || 0),
            currentHoldDurationMs: currentHoldDuration,
            currentHoldDuration: formatDuration(currentHoldDuration),
            holdCount: clientData.holdStatus?.holdCount || 0,
            heldBy: clientData.holdStatus?.heldBy,
            activatedBy: clientData.holdStatus?.activatedBy,
            history: (clientData.holdStatusHistory || []).map((entry: any) => ({
                ...entry,
                holdDuration: entry.holdDurationMs ? formatDuration(entry.holdDurationMs) : undefined
            }))
        });

    } catch (error: any) {
        console.error('[GET /api/admin/clients/[clientId]/hold] Error:', error);
        return NextResponse.json({
            error: 'Failed to get hold status',
            details: error?.message
        }, { status: 500 });
    }
}
