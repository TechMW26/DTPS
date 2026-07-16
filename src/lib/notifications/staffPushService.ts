import connectDB from '@/lib/db/connection';
import User from '@/lib/db/models/User';
import Notification from '@/lib/db/models/Notification';
import NotificationDeliveryAudit from '@/lib/db/models/NotificationDeliveryAudit';
import { sendNotificationToUser } from '@/lib/firebase';
import { socketManager } from '@/lib/realtime/socket-manager';
import { SOCKET_EVENTS } from '@/lib/realtime/socket-events';
import { UserRole } from '@/types';

export type ClientUpdateType =
    | 'basic_details'
    | 'medical_information'
    | 'lifestyle_data'
    | 'recall_form'
    | 'measurements'
    | 'weight_update';

export interface AssignmentSnapshot {
    primaryDietitianId: string | null;
    secondaryDietitianIds: string[];
    primaryHealthCounselorId: string | null;
    secondaryHealthCounselorIds: string[];
}

interface ClientAssignments {
    clientId: string;
    clientName: string;
    primaryDietitianId: string | null;
    secondaryDietitianIds: string[];
    primaryHealthCounselorId: string | null;
    secondaryHealthCounselorIds: string[];
}

interface StaffPushParams {
    recipientUserId: string;
    recipientRole: string;
    title: string;
    body: string;
    actionType: 'assigned' | 'message' | 'meal' | 'update';
    clientId?: string;
    clientName?: string;
    clickAction: string;
    dedupeKey?: string;
    data?: Record<string, unknown>;
    timestamp?: Date;
}

interface DeliveryAuditParams {
    recipientUserId: string;
    recipientRole: string;
    title: string;
    body: string;
    actionType: StaffPushParams['actionType'];
    status: 'sent' | 'deduped' | 'failed';
    clientId?: string;
    clientName?: string;
    clickAction: string;
    dedupeKey?: string;
    error?: string;
    latencyMs?: number;
    metadata?: Record<string, unknown>;
}

function toIdString(value: unknown): string | null {
    if (!value) return null;
    if (typeof value === 'string') return value;
    if (typeof value === 'object' && value !== null) {
        const maybeId = value as { _id?: unknown; toString?: () => string };
        if (typeof maybeId._id === 'string') return maybeId._id;
        if (maybeId._id && typeof maybeId._id === 'object' && typeof (maybeId._id as any).toString === 'function') {
            return (maybeId._id as any).toString();
        }
        if (typeof maybeId.toString === 'function') {
            const converted = maybeId.toString();
            if (converted && converted !== '[object Object]') {
                return converted;
            }
        }
    }
    return null;
}

function normalizeIdList(values: unknown[] = []): string[] {
    const unique = new Set<string>();
    values.forEach((value) => {
        const id = toIdString(value);
        if (id) unique.add(id);
    });
    return Array.from(unique);
}

function toFcmData(data: Record<string, unknown>): Record<string, string> {
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(data)) {
        if (value === undefined || value === null) continue;
        if (typeof value === 'string') {
            normalized[key] = value;
        } else if (typeof value === 'number' || typeof value === 'boolean') {
            normalized[key] = String(value);
        } else {
            normalized[key] = JSON.stringify(value);
        }
    }
    return normalized;
}

function formatTimestamp(timestamp: Date): string {
    return timestamp.toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function getClientProfilePathForRole(role: string, clientId: string): string {
    const normalizedRole = String(role || '').toLowerCase();

    if (normalizedRole === UserRole.DIETITIAN) {
        return `/dietician/clients/${clientId}`;
    }

    if (normalizedRole === UserRole.HEALTH_COUNSELOR) {
        return `/health-counselor/clients/${clientId}`;
    }

    if (normalizedRole === UserRole.ADMIN) {
        return '/admin/allclients';
    }

    return '/dashboard';
}

function getChatPathForRole(role: string, conversationWithUserId: string): string {
    const normalizedRole = String(role || '').toLowerCase();

    if (!conversationWithUserId) {
        if (normalizedRole === UserRole.HEALTH_COUNSELOR) return '/health-counselor/messages';
        if (normalizedRole === UserRole.CLIENT) return '/user/messages';
        return '/messages';
    }

    if (normalizedRole === UserRole.HEALTH_COUNSELOR) {
        return `/health-counselor/messages?conversationWith=${conversationWithUserId}`;
    }

    if (normalizedRole === UserRole.CLIENT) {
        return `/user/messages?conversationWith=${conversationWithUserId}`;
    }

    return `/messages?conversationWith=${conversationWithUserId}`;
}

async function isDuplicateNotification(userId: string, dedupeKey?: string): Promise<boolean> {
    if (!dedupeKey) return false;

    await connectDB();
    const existing = await Notification.findOne({
        userId,
        'data.dedupeKey': dedupeKey,
    })
        .select('_id')
        .lean();

    return Boolean(existing);
}

async function logDeliveryAudit({
    recipientUserId,
    recipientRole,
    title,
    body,
    actionType,
    status,
    clientId,
    clientName,
    clickAction,
    dedupeKey,
    error,
    latencyMs,
    metadata = {},
}: DeliveryAuditParams): Promise<void> {
    try {
        await connectDB();

        await NotificationDeliveryAudit.create({
            recipientUserId,
            recipientRole: String(recipientRole || '').toLowerCase(),
            actionType,
            status,
            dedupeKey,
            clientId,
            clientName,
            clickAction,
            title,
            body,
            error,
            latencyMs,
            metadata,
        });
    } catch (auditError) {
        console.error('Failed to write notification delivery audit log:', auditError);
    }
}

async function sendStaffPushNotification({
    recipientUserId,
    recipientRole,
    title,
    body,
    actionType,
    clientId,
    clientName,
    clickAction,
    dedupeKey,
    data = {},
    timestamp = new Date(),
}: StaffPushParams): Promise<void> {
    if (!recipientUserId) return;

    if (await isDuplicateNotification(recipientUserId, dedupeKey)) {
        await logDeliveryAudit({
            recipientUserId,
            recipientRole,
            title,
            body,
            actionType,
            clientId,
            clientName,
            clickAction,
            dedupeKey,
            status: 'deduped',
            metadata: {
                reason: 'duplicate_notification_dedupe_key',
            },
        });
        return;
    }

    const timestampIso = timestamp.toISOString();
    const sendStartedAt = Date.now();

    try {
        const sendResult = await sendNotificationToUser(recipientUserId, {
            title,
            body,
            icon: '/icons/icon-192x192.png',
            badge: '/icons/icon-72x72.png',
            clickAction,
            data: toFcmData({
                type: actionType === 'message' ? 'new_message' : 'custom',
                actionType,
                clientId,
                clientName,
                recipientRole,
                clickAction,
                timestamp: timestampIso,
                dedupeKey,
                tag: dedupeKey,
                ...data,
            }),
        });

        const successCount = Number(sendResult?.successCount || 0);
        const failureCount = Number(sendResult?.failureCount || 0);
        const status = successCount > 0 ? 'sent' : 'failed';

        await logDeliveryAudit({
            recipientUserId,
            recipientRole,
            title,
            body,
            actionType,
            clientId,
            clientName,
            clickAction,
            dedupeKey,
            status,
            latencyMs: Date.now() - sendStartedAt,
            error: status === 'failed' ? 'Push delivery returned zero successful sends' : undefined,
            metadata: {
                successCount,
                failureCount,
                invalidTokens: sendResult?.invalidTokens || [],
            },
        });
    } catch (sendError) {
        await logDeliveryAudit({
            recipientUserId,
            recipientRole,
            title,
            body,
            actionType,
            clientId,
            clientName,
            clickAction,
            dedupeKey,
            status: 'failed',
            latencyMs: Date.now() - sendStartedAt,
            error: sendError instanceof Error ? sendError.message : 'Unknown push send error',
        });
    }
}

export function buildAssignmentSnapshot(client: Record<string, unknown>): AssignmentSnapshot {
    const primaryDietitianId = toIdString(client.assignedDietitian);
    const primaryHealthCounselorId = toIdString(client.assignedHealthCounselor);

    const secondaryDietitianIds = normalizeIdList(Array.isArray(client.assignedDietitians) ? client.assignedDietitians : [])
        .filter((id) => id !== primaryDietitianId);

    const secondaryHealthCounselorIds = normalizeIdList(
        Array.isArray(client.assignedHealthCounselors) ? client.assignedHealthCounselors : []
    ).filter((id) => id !== primaryHealthCounselorId);

    return {
        primaryDietitianId,
        secondaryDietitianIds,
        primaryHealthCounselorId,
        secondaryHealthCounselorIds,
    };
}

export async function getClientAssignments(clientId: string): Promise<ClientAssignments | null> {
    await connectDB();

    const client = await User.findById(clientId)
        .select('firstName lastName assignedDietitian assignedDietitians assignedHealthCounselor assignedHealthCounselors')
        .lean() as Record<string, unknown> | null;

    if (!client) {
        return null;
    }

    const snapshot = buildAssignmentSnapshot(client);
    const clientName = `${String(client.firstName || '').trim()} ${String(client.lastName || '').trim()}`.trim() || 'Client';

    return {
        clientId,
        clientName,
        ...snapshot,
    };
}

export async function notifyAssignmentChanges(params: {
    clientId: string;
    clientName?: string;
    before: AssignmentSnapshot;
    after: AssignmentSnapshot;
    timestamp?: Date;
}): Promise<void> {
    const { clientId, clientName = 'Client', before, after, timestamp = new Date() } = params;

    const tsLabel = formatTimestamp(timestamp);

    if (after.primaryDietitianId && after.primaryDietitianId !== before.primaryDietitianId) {
        await sendStaffPushNotification({
            recipientUserId: after.primaryDietitianId,
            recipientRole: UserRole.DIETITIAN,
            title: 'New Client Assignment',
            body: `Client: ${clientName} • Action: Assigned (Primary Dietitian) • Time: ${tsLabel}`,
            actionType: 'assigned',
            clientId,
            clientName,
            clickAction: getClientProfilePathForRole(UserRole.DIETITIAN, clientId),
            dedupeKey: `assignment:${clientId}:${after.primaryDietitianId}:dietitian:primary:${Math.floor(timestamp.getTime() / 60000)}`,
            data: {
                assignmentRole: 'dietitian',
                assignmentLevel: 'primary',
            },
            timestamp,
        });
    }

    const beforeSecondaryDietitian = new Set(before.secondaryDietitianIds || []);
    for (const dietitianId of after.secondaryDietitianIds || []) {
        if (beforeSecondaryDietitian.has(dietitianId)) continue;

        await sendStaffPushNotification({
            recipientUserId: dietitianId,
            recipientRole: UserRole.DIETITIAN,
            title: 'New Client Assignment',
            body: `Client: ${clientName} • Action: Assigned (Secondary Dietitian) • Time: ${tsLabel}`,
            actionType: 'assigned',
            clientId,
            clientName,
            clickAction: getClientProfilePathForRole(UserRole.DIETITIAN, clientId),
            dedupeKey: `assignment:${clientId}:${dietitianId}:dietitian:secondary:${Math.floor(timestamp.getTime() / 60000)}`,
            data: {
                assignmentRole: 'dietitian',
                assignmentLevel: 'secondary',
            },
            timestamp,
        });
    }

    if (after.primaryHealthCounselorId && after.primaryHealthCounselorId !== before.primaryHealthCounselorId) {
        await sendStaffPushNotification({
            recipientUserId: after.primaryHealthCounselorId,
            recipientRole: UserRole.HEALTH_COUNSELOR,
            title: 'New Client Assignment',
            body: `Client: ${clientName} • Action: Assigned (Primary Health Counselor) • Time: ${tsLabel}`,
            actionType: 'assigned',
            clientId,
            clientName,
            clickAction: getClientProfilePathForRole(UserRole.HEALTH_COUNSELOR, clientId),
            dedupeKey: `assignment:${clientId}:${after.primaryHealthCounselorId}:health-counselor:primary:${Math.floor(timestamp.getTime() / 60000)}`,
            data: {
                assignmentRole: 'health_counselor',
                assignmentLevel: 'primary',
            },
            timestamp,
        });
    }

    const beforeSecondaryHC = new Set(before.secondaryHealthCounselorIds || []);
    for (const counselorId of after.secondaryHealthCounselorIds || []) {
        if (beforeSecondaryHC.has(counselorId)) continue;

        await sendStaffPushNotification({
            recipientUserId: counselorId,
            recipientRole: UserRole.HEALTH_COUNSELOR,
            title: 'New Client Assignment',
            body: `Client: ${clientName} • Action: Assigned (Secondary Health Counselor) • Time: ${tsLabel}`,
            actionType: 'assigned',
            clientId,
            clientName,
            clickAction: getClientProfilePathForRole(UserRole.HEALTH_COUNSELOR, clientId),
            dedupeKey: `assignment:${clientId}:${counselorId}:health-counselor:secondary:${Math.floor(timestamp.getTime() / 60000)}`,
            data: {
                assignmentRole: 'health_counselor',
                assignmentLevel: 'secondary',
            },
            timestamp,
        });
    }
}

export async function notifyMealPictureUploaded(params: {
    clientId: string;
    clientName?: string;
    primaryDietitianId?: string | null;
    secondaryDietitianIds?: string[];
    eventKey: string;
    timestamp?: Date;
}): Promise<void> {
    const {
        clientId,
        clientName = 'Client',
        primaryDietitianId = null,
        secondaryDietitianIds = [],
        eventKey,
        timestamp = new Date(),
    } = params;

    const recipients = new Set<string>();
    if (primaryDietitianId) recipients.add(primaryDietitianId);
    (secondaryDietitianIds || []).forEach((id) => {
        if (id) recipients.add(id);
    });

    const tsLabel = formatTimestamp(timestamp);

    for (const dietitianId of recipients) {
        await sendStaffPushNotification({
            recipientUserId: dietitianId,
            recipientRole: UserRole.DIETITIAN,
            title: 'Meal Picture Uploaded',
            body: `Client: ${clientName} • Action: Meal Picture Upload • Time: ${tsLabel}`,
            actionType: 'meal',
            clientId,
            clientName,
            clickAction: getChatPathForRole(UserRole.DIETITIAN, clientId),
            dedupeKey: `meal-picture:${eventKey}:${dietitianId}`,
            data: {
                mealEvent: 'meal_picture_uploaded',
            },
            timestamp,
        });
    }
}

export async function notifyMessageToRecipient(params: {
    recipientId: string;
    recipientRole: string;
    senderName: string;
    senderRole?: string;
    messagePreview: string;
    messageId: string;
    conversationWithUserId: string;
    clientId?: string;
    clientName?: string;
    timestamp?: Date;
}): Promise<void> {
    const {
        recipientId,
        recipientRole,
        senderName,
        senderRole,
        messagePreview,
        messageId,
        conversationWithUserId,
        clientId,
        clientName,
        timestamp = new Date(),
    } = params;

    const preview = (messagePreview || '').trim();
    const trimmedPreview = preview.length > 100 ? `${preview.slice(0, 100)}...` : preview;
    const tsLabel = formatTimestamp(timestamp);
    const normalizedRecipientRole = String(recipientRole || '').toLowerCase();
    const isClientRecipient = normalizedRecipientRole === UserRole.CLIENT;

    const notificationBody = isClientRecipient
        ? (trimmedPreview || 'New message received')
        : `Action: Message • ${trimmedPreview || 'New message received'} • Time: ${tsLabel}`;

    await sendStaffPushNotification({
        recipientUserId: recipientId,
        recipientRole,
        title: `New message from ${senderName}`,
        body: notificationBody,
        actionType: 'message',
        clientId,
        clientName,
        clickAction: getChatPathForRole(recipientRole, conversationWithUserId),
        dedupeKey: `message:${messageId}:${recipientId}`,
        data: {
            senderName,
            senderRole,
            messageId,
            conversationWith: conversationWithUserId,
            clientId,
            clientName,
        },
        timestamp,
    });
}

export async function notifyClientDataUpdate(params: {
    clientId: string;
    updateType: ClientUpdateType;
    includeHealthCounselor?: boolean;
    eventKey?: string;
    timestamp?: Date;
}): Promise<void> {
    const {
        clientId,
        updateType,
        includeHealthCounselor = true,
        eventKey,
        timestamp = new Date(),
    } = params;

    const assignments = await getClientAssignments(clientId);
    if (!assignments) return;

    const updateLabels: Record<ClientUpdateType, string> = {
        basic_details: 'Basic Details Updated',
        medical_information: 'Medical Information Updated',
        lifestyle_data: 'Lifestyle Data Updated',
        recall_form: 'Recall Form Updated',
        measurements: 'Measurements Updated',
        weight_update: 'Weight Updated',
    };

    const actionLabel = updateLabels[updateType] || 'Client Data Updated';
    const tsLabel = formatTimestamp(timestamp);
    const dedupeBucket = eventKey || `${updateType}:${clientId}:${Math.floor(timestamp.getTime() / 60000)}`;

    // Emit socket event to staff so they see real-time banner (works even without FCM token)
    const socketPayload = {
        clientId,
        clientName: assignments.clientName,
        updateType,
        actionLabel,
        timestamp: timestamp.toISOString(),
    };

    if (assignments.primaryDietitianId) {
        // Send socket event for real-time banner
        socketManager.sendToUser(assignments.primaryDietitianId, SOCKET_EVENTS.CLIENT_UPDATED, socketPayload);

        // Also send FCM push notification
        await sendStaffPushNotification({
            recipientUserId: assignments.primaryDietitianId,
            recipientRole: UserRole.DIETITIAN,
            title: actionLabel,
            body: `Client: ${assignments.clientName} • Action: ${actionLabel} • Time: ${tsLabel}`,
            actionType: 'update',
            clientId,
            clientName: assignments.clientName,
            clickAction: getClientProfilePathForRole(UserRole.DIETITIAN, clientId),
            dedupeKey: `update:${dedupeBucket}:${assignments.primaryDietitianId}`,
            data: {
                updateType,
            },
            timestamp,
        });
    }

    if (includeHealthCounselor && assignments.primaryHealthCounselorId) {
        // Send socket event for real-time banner
        socketManager.sendToUser(assignments.primaryHealthCounselorId, SOCKET_EVENTS.CLIENT_UPDATED, socketPayload);

        // Also send FCM push notification
        await sendStaffPushNotification({
            recipientUserId: assignments.primaryHealthCounselorId,
            recipientRole: UserRole.HEALTH_COUNSELOR,
            title: actionLabel,
            body: `Client: ${assignments.clientName} • Action: ${actionLabel} • Time: ${tsLabel}`,
            actionType: 'update',
            clientId,
            clientName: assignments.clientName,
            clickAction: getClientProfilePathForRole(UserRole.HEALTH_COUNSELOR, clientId),
            dedupeKey: `update:${dedupeBucket}:${assignments.primaryHealthCounselorId}`,
            data: {
                updateType,
            },
            timestamp,
        });
    }
}
