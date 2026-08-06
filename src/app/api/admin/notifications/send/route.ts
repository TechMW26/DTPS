import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import User from '@/lib/db/models/User';
import Notification from '@/lib/db/models/Notification';
import UnifiedPayment from '@/lib/db/models/UnifiedPayment';
import { UserRole } from '@/types';
import { z } from 'zod';
import { sendNotificationToUser } from '@/lib/firebase/firebaseNotification';
import { computeClientStatusFromDocs } from '@/lib/status/computeClientStatus';

const notificationTargetRoleSchema = z.enum([
  UserRole.CLIENT,
  UserRole.DIETITIAN,
  UserRole.HEALTH_COUNSELOR,
]);

type NotificationTargetRole = z.infer<typeof notificationTargetRoleSchema>;

const TARGET_TYPE_VALUES = ['particular', 'selected', 'all', 'single', 'multiple'] as const;
type RawTargetType = (typeof TARGET_TYPE_VALUES)[number];
type NormalizedTargetType = 'particular' | 'selected' | 'all';

const DEFAULT_ADMIN_TARGET_ROLES: NotificationTargetRole[] = [
  UserRole.CLIENT,
  UserRole.DIETITIAN,
  UserRole.HEALTH_COUNSELOR,
];

const allowedSenderRoles = [UserRole.ADMIN, UserRole.DIETITIAN, UserRole.HEALTH_COUNSELOR] as const;

function isAllowedSenderRole(role: unknown): role is (typeof allowedSenderRoles)[number] {
  return allowedSenderRoles.includes(role as (typeof allowedSenderRoles)[number]);
}

function uniqueStrings(values: Array<string | undefined | null>): string[] {
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
}

function normalizeTargetType(targetType: RawTargetType): NormalizedTargetType {
  if (targetType === 'single') return 'particular';
  if (targetType === 'multiple') return 'selected';
  return targetType;
}

function normalizeRoleList(values: unknown[]): NotificationTargetRole[] {
  const normalized = uniqueStrings(values as string[])
    .filter((role): role is NotificationTargetRole =>
      [UserRole.CLIENT, UserRole.DIETITIAN, UserRole.HEALTH_COUNSELOR].includes(role as NotificationTargetRole)
    );

  return Array.from(new Set(normalized));
}

function getDefaultClickActionForRole(role: NotificationTargetRole): string {
  if (role === UserRole.CLIENT) return '/user/notifications';
  if (role === UserRole.DIETITIAN) return '/dietician';
  if (role === UserRole.HEALTH_COUNSELOR) return '/health-counselor';
  return '/dashboard';
}

type AccessibleSession = {
  user: {
    id: string;
    role: UserRole;
  };
};

type RecipientUserRow = {
  _id: unknown;
  firstName?: string;
  lastName?: string;
  email?: string;
  avatar?: string;
  role?: string;
  status?: string;
  clientStatus?: string;
  fcmTokens?: unknown;
};

function getAccessibleClientQuery(session: AccessibleSession): Record<string, unknown> {
  const query: Record<string, unknown> = {
    role: UserRole.CLIENT,
  };

  if (session.user.role === UserRole.DIETITIAN) {
    query.$or = [
      { assignedDietitian: session.user.id },
      { assignedDietitians: session.user.id },
    ];
  }

  if (session.user.role === UserRole.HEALTH_COUNSELOR) {
    query.$or = [
      { assignedHealthCounselor: session.user.id },
      { assignedHealthCounselors: session.user.id },
    ];
  }

  return query;
}

function normalizeFcmTokenValue(rawToken: unknown): string {
  const value = String(rawToken || '').trim();
  if (!value) return '';

  const lowered = value.toLowerCase();
  if (lowered === 'null' || lowered === 'undefined' || lowered === 'nan') {
    return '';
  }

  return value;
}

function getValidFcmTokenCount(rawTokens: unknown): number {
  if (!Array.isArray(rawTokens)) return 0;

  const validTokens = rawTokens
    .map((entry: unknown) => {
      if (typeof entry === 'string') {
        return normalizeFcmTokenValue(entry);
      }

      if (entry && typeof entry === 'object' && 'token' in entry) {
        return normalizeFcmTokenValue((entry as { token?: unknown }).token);
      }

      return '';
    })
    .filter(Boolean);

  return new Set(validTokens).size;
}

function mapRecipient(user: RecipientUserRow) {
  const tokenCount = getValidFcmTokenCount(user?.fcmTokens);
  const role = String(user.role || UserRole.CLIENT);

  // For clients, expose the computed client status (lead/active/inactive/hold)
  // so notification filters align with the rest of the app. Other roles fall
  // back to their account status.
  const status =
    role === UserRole.CLIENT
      ? String(user.clientStatus || user.status || '')
      : String(user.status || '');

  return {
    id: String(user._id),
    name: `${String(user.firstName || '').trim()} ${String(user.lastName || '').trim()}`.trim() || 'Unnamed User',
    email: String(user.email || ''),
    avatar: user.avatar,
    role,
    status,
    hasFcmToken: tokenCount > 0,
    tokenCount,
  };
}

const customNotificationSchema = z.object({
  title: z.string().min(1, 'Title is required').max(100),
  body: z.string().min(1, 'Message is required').max(500),
  targetType: z.enum(TARGET_TYPE_VALUES),
  userIds: z.array(z.string()).optional(),
  clientIds: z.array(z.string()).optional(),
  recipientRole: notificationTargetRoleSchema.optional(),
  recipientRoles: z.array(notificationTargetRoleSchema).optional(),
  clickAction: z.string().optional(),
  data: z.object({
    type: z.string().optional(),
    url: z.string().optional(),
  }).optional()
});

const deleteNotificationSchema = z.object({
  targetType: z.enum(TARGET_TYPE_VALUES),
  userIds: z.array(z.string()).optional(),
  clientIds: z.array(z.string()).optional(),
  recipientRole: notificationTargetRoleSchema.optional(),
  recipientRoles: z.array(notificationTargetRoleSchema).optional(),
  readState: z.enum(['all', 'read', 'unread']).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }

    if (!isAllowedSenderRole(session.user.role)) {
      return NextResponse.json(
        { success: false, message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    await connectDB();

    const body = await request.json();
    const validatedData = customNotificationSchema.parse(body);
    const normalizedTargetType = normalizeTargetType(validatedData.targetType);
    const isAdmin = session.user.role === UserRole.ADMIN;

    const requestedUserIds = uniqueStrings([
      ...(validatedData.userIds || []),
      ...(validatedData.clientIds || []),
    ]);

    const requestedRoles = normalizeRoleList([
      ...(validatedData.recipientRoles || []),
      validatedData.recipientRole,
    ]);

    const effectiveRoles: NotificationTargetRole[] = isAdmin
      ? (requestedRoles.length > 0 ? requestedRoles : DEFAULT_ADMIN_TARGET_ROLES)
      : [UserRole.CLIENT];

    let targetUsers: Array<{ _id: unknown; role: NotificationTargetRole }> = [];

    if (isAdmin) {
      if (normalizedTargetType === 'all') {
        targetUsers = await User.find({
          role: { $in: effectiveRoles },
        }).select('_id role');
      } else {
        if (requestedUserIds.length === 0) {
          return NextResponse.json(
            { success: false, message: 'User IDs are required for particular/selected targeting' },
            { status: 400 }
          );
        }

        targetUsers = await User.find({
          _id: { $in: requestedUserIds },
          role: { $in: effectiveRoles },
        }).select('_id role');
      }
    } else {
      const clientQuery = getAccessibleClientQuery(session);

      if (normalizedTargetType === 'all') {
        targetUsers = await User.find(clientQuery).select('_id role');
      } else {
        if (requestedUserIds.length === 0) {
          return NextResponse.json(
            { success: false, message: 'Client IDs are required for particular/selected targeting' },
            { status: 400 }
          );
        }

        targetUsers = await User.find({
          ...clientQuery,
          _id: { $in: requestedUserIds },
        }).select('_id role');
      }
    }

    const targetUserIds = uniqueStrings(targetUsers.map((user) => String(user._id)));

    let successCount = 0;
    let failCount = 0;
    let skippedNoTokenCount = 0;
    let firebaseUnavailableCount = 0;

    if (targetUserIds.length === 0) {
      return NextResponse.json(
        { success: false, message: 'No users found for selected role/target filters' },
        { status: 400 }
      );
    }

    const targetRoleByUserId = new Map(
      targetUsers.map((user) => [String(user._id), user.role])
    );

    const sendResults = await Promise.allSettled(
      targetUserIds.map(async (userId) => {
        const recipientRole = (targetRoleByUserId.get(userId) || UserRole.CLIENT) as NotificationTargetRole;
        const clickAction = validatedData.clickAction || validatedData.data?.url || getDefaultClickActionForRole(recipientRole);

        const response = await sendNotificationToUser(userId, {
          title: validatedData.title,
          body: validatedData.body,
          clickAction,
          data: {
            type: validatedData.data?.type || 'custom',
            actionType: 'custom',
            recipientRole,
            url: clickAction,
            sentBy: session.user.id,
            sentByRole: String(session.user.role || ''),
            sentAt: new Date().toISOString(),
          },
        });

        return response;
      })
    );

    sendResults.forEach((result) => {
      if (result.status === 'rejected') {
        failCount += 1;
        return;
      }

      const value = result.value;

      if (value.errorCode === 'FIREBASE_UNAVAILABLE') {
        failCount += 1;
        firebaseUnavailableCount += 1;
        return;
      }

      if (value.skippedNoToken || value.errorCode === 'NO_TOKEN') {
        skippedNoTokenCount += 1;
        return;
      }

      if ((value.successCount || 0) > 0) {
        successCount += 1;
      } else if ((value.failureCount || 0) > 0) {
        failCount += 1;
      } else {
        skippedNoTokenCount += 1;
      }
    });

    const stats = {
      total: targetUserIds.length,
      success: successCount,
      failed: failCount,
      skippedNoToken: skippedNoTokenCount,
      firebaseUnavailable: firebaseUnavailableCount,
    };

    const tokenHelp = {
      web: 'Open DTPS in browser, click Enable Notifications, and allow browser notification permission.',
      android: 'Open DTPS Android app and sign in. Token is registered automatically once Firebase token is available.',
      ios: 'Use DTPS iOS/native app with notification permission enabled so the device token can be registered.',
    };

    if (successCount === 0 && firebaseUnavailableCount > 0) {
      return NextResponse.json(
        {
          success: false,
          message: 'Notification service is currently unavailable. Firebase messaging is not initialized.',
          stats,
        },
        { status: 503 }
      );
    }

    if (successCount === 0 && skippedNoTokenCount === targetUserIds.length) {
      return NextResponse.json(
        {
          success: false,
          message: 'None of the selected users have active notification tokens. Ask users to enable notifications and then try again.',
          stats,
          tokenHelp,
        },
        { status: 400 }
      );
    }

    if (successCount === 0 && failCount > 0) {
      return NextResponse.json(
        {
          success: false,
          message: 'Notification delivery failed for all selected users. Please retry and verify Firebase setup/token health.',
          stats,
          tokenHelp,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      message: failCount > 0 || skippedNoTokenCount > 0
        ? 'Notification dispatch completed with warnings'
        : 'Notification dispatch completed',
      stats,
      tokenHelp,
      target: {
        targetType: normalizedTargetType,
        recipientRoles: effectiveRoles,
      },
    });

  } catch (error) {
    console.error('Error sending custom notification:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, message: 'Validation error', errors: error.format() },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, message: 'Failed to send notification' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }

    if (!isAllowedSenderRole(session.user.role)) {
      return NextResponse.json(
        { success: false, message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    await connectDB();
    const isAdmin = session.user.role === UserRole.ADMIN;
    const { searchParams } = new URL(request.url);
    const rolesParam = searchParams.get('roles');

    const requestedRoles = normalizeRoleList(
      rolesParam ? rolesParam.split(',') : []
    );

    let recipients: Array<{
      id: string;
      name: string;
      email: string;
      avatar?: string;
      role: string;
      status?: string;
      hasFcmToken: boolean;
      tokenCount?: number;
    }> = [];
    const holdById = new Map<string, boolean>();

    if (isAdmin) {
      const effectiveRoles = requestedRoles.length > 0 ? requestedRoles : DEFAULT_ADMIN_TARGET_ROLES;

      const users = await User.find({ role: { $in: effectiveRoles } })
        .select('_id firstName lastName email avatar role status clientStatus holdStatus fcmTokens')
        .sort({ firstName: 1, lastName: 1 });

      users.forEach((user) => holdById.set(String(user._id), !!user.holdStatus?.isOnHold));
      recipients = users.map(mapRecipient);
    } else {
      const clients = await User.find(getAccessibleClientQuery(session))
        .select('_id firstName lastName email avatar role status clientStatus holdStatus fcmTokens')
        .sort({ firstName: 1, lastName: 1 });

      clients.forEach((user) => holdById.set(String(user._id), !!user.holdStatus?.isOnHold));
      recipients = clients.map(mapRecipient);
    }

    // Recompute client status dynamically from payment dates (same logic as the
    // clients list) so the persisted clientStatus being stale doesn't cause
    // inactive/hold clients to be missed by the notification status filter.
    const clientRecipientIds = recipients
      .filter((recipient) => recipient.role === UserRole.CLIENT)
      .map((recipient) => recipient.id);

    if (clientRecipientIds.length > 0) {
      const paymentDocs = await UnifiedPayment.find(
        {
          client: { $in: clientRecipientIds },
          $or: [{ status: { $in: ['paid', 'completed', 'active'] } }, { paymentStatus: 'paid' }],
        },
        { client: 1, status: 1, paymentStatus: 1, expectedEndDate: 1, endDate: 1 }
      ).lean();

      const purchasesByClient = new Map<string, any[]>();
      paymentDocs.forEach((payment: any) => {
        const cid = String(payment.client);
        if (!purchasesByClient.has(cid)) purchasesByClient.set(cid, []);
        purchasesByClient.get(cid)!.push(payment);
      });

      recipients = recipients.map((recipient) => {
        if (recipient.role !== UserRole.CLIENT) {
          return recipient;
        }
        const payments = purchasesByClient.get(recipient.id) || [];
        const isOnHold = holdById.get(recipient.id) || false;
        return { ...recipient, status: computeClientStatusFromDocs(payments, isOnHold) };
      });
    }

    const clients = recipients.filter((recipient) => recipient.role === UserRole.CLIENT);

    return NextResponse.json({
      success: true,
      recipients,
      clients,
      availableRoles: isAdmin ? DEFAULT_ADMIN_TARGET_ROLES : [UserRole.CLIENT],
    });

  } catch (error) {
    console.error('Error fetching clients for notification:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch clients' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }

    if (session.user.role !== UserRole.ADMIN) {
      return NextResponse.json(
        { success: false, message: 'Only admin can bulk delete notifications' },
        { status: 403 }
      );
    }

    await connectDB();

    const body = await request.json();
    const validatedData = deleteNotificationSchema.parse(body);

    const normalizedTargetType = normalizeTargetType(validatedData.targetType);
    const requestedUserIds = uniqueStrings([
      ...(validatedData.userIds || []),
      ...(validatedData.clientIds || []),
    ]);

    const requestedRoles = normalizeRoleList([
      ...(validatedData.recipientRoles || []),
      validatedData.recipientRole,
    ]);

    const effectiveRoles = requestedRoles.length > 0 ? requestedRoles : DEFAULT_ADMIN_TARGET_ROLES;

    let targetUsers: Array<{ _id: unknown }> = [];

    if (normalizedTargetType === 'all') {
      targetUsers = await User.find({
        role: { $in: effectiveRoles },
      }).select('_id');
    } else {
      if (requestedUserIds.length === 0) {
        return NextResponse.json(
          { success: false, message: 'User IDs are required for particular/selected delete' },
          { status: 400 }
        );
      }

      targetUsers = await User.find({
        _id: { $in: requestedUserIds },
        role: { $in: effectiveRoles },
      }).select('_id');
    }

    const targetUserIds = uniqueStrings(targetUsers.map((user) => String(user._id)));

    if (targetUserIds.length === 0) {
      return NextResponse.json(
        { success: false, message: 'No users found for deletion target' },
        { status: 400 }
      );
    }

    const deleteQuery: Record<string, unknown> = {
      userId: { $in: targetUserIds },
    };

    if (validatedData.readState === 'read') {
      deleteQuery.read = true;
    }

    if (validatedData.readState === 'unread') {
      deleteQuery.read = false;
    }

    const deleteResult = await Notification.deleteMany(deleteQuery);

    return NextResponse.json({
      success: true,
      message: 'Notifications deleted successfully',
      stats: {
        deletedNotifications: Number(deleteResult.deletedCount || 0),
        targetUsers: targetUserIds.length,
      },
      target: {
        targetType: normalizedTargetType,
        recipientRoles: effectiveRoles,
        readState: validatedData.readState || 'all',
      },
    });
  } catch (error) {
    console.error('Error deleting notifications:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, message: 'Validation error', errors: error.format() },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, message: 'Failed to delete notifications' },
      { status: 500 }
    );
  }
}
