import { getNativeDatabase } from '@/lib/db/database';
import { nativeNotificationUsers, saveNativeNotifications, registerNativePushToken, removeNativePushTokens } from '@/lib/db/repository/native-notifications';
import { getMessaging, getNativeMessaging } from './firebaseAdmin';

export interface FCMNotificationPayload {
    title: string;
    body: string;
    icon?: string;
    image?: string;
    badge?: string;
    data?: Record<string, string>;
    clickAction?: string;
    saveToDb?: boolean; // Whether to save notification to database (default: true)
}

export interface SendNotificationResult {
    successCount: number;
    failureCount: number;
    invalidTokens: string[];
    responses: Array<{ token: string; success: boolean; error?: string }>;
    skippedNoToken?: boolean;
    errorCode?: 'NO_TOKEN' | 'FIREBASE_UNAVAILABLE' | 'CLIENT_ON_HOLD' | 'LOCAL_DELIVERY_DISABLED' | 'UNKNOWN';
    errorMessage?: string;
}

const INVALID_TOKEN_SENTINELS = new Set(['', 'null', 'undefined', 'nan']);

function normalizeTokenValue(rawToken: unknown): string | null {
    const token = String(rawToken || '').trim();
    if (!token) return null;
    if (INVALID_TOKEN_SENTINELS.has(token.toLowerCase())) return null;
    return token;
}

function extractValidTokenStrings(rawTokens: unknown): string[] {
    if (!Array.isArray(rawTokens)) return [];

    const normalized = rawTokens
        .map((tokenEntry: any) => {
            if (typeof tokenEntry === 'string') {
                return normalizeTokenValue(tokenEntry);
            }
            return normalizeTokenValue(tokenEntry?.token);
        })
        .filter((token): token is string => Boolean(token));

    return Array.from(new Set(normalized));
}

/**
 * Map notification data type to database notification type
 */
function mapNotificationType(dataType?: string): string {
    const typeMap: Record<string, string> = {
        'new_message': 'message',
        'appointment_booked': 'appointment',
        'appointment_cancelled': 'appointment',
        'appointment_reminder': 'appointment',
        'task_assigned': 'task',
        'meal_plan_created': 'meal',
        'meal_plan_updated': 'meal',
        'meal_upcoming': 'meal',
        'meal_photo_prompt': 'meal',
        'payment_link_created': 'payment',
        'custom': 'custom',
    };
    return typeMap[dataType || ''] || 'system';
}

function getAndroidNotificationChannel(dataType?: string): string {
    switch (dataType) {
        case 'new_message':
        case 'message':
            return 'dtps_messages';
        case 'appointment':
        case 'appointment_booked':
        case 'appointment_cancelled':
        case 'appointment_reminder':
            return 'dtps_appointments';
        case 'payment':
        case 'payment_link':
        case 'payment_link_created':
            return 'dtps_payments';
        case 'task_assigned':
        case 'meal_plan':
        case 'meal_plan_created':
        case 'meal_plan_updated':
        case 'meal_upcoming':
        case 'meal_photo_prompt':
            return 'dtps_tasks';
        case 'call':
        case 'incoming_call':
            return 'dtps_calls';
        default:
            return 'dtps_notifications';
    }
}

/**
 * Send a push notification to a specific user across all their registered devices
 * Also stores the notification in the database for viewing in the app
 */
export async function sendNotificationToUser(
    userId: string,
    notification: FCMNotificationPayload
): Promise<SendNotificationResult> {
    try {
        const db = getNativeDatabase();

        // Check if user is a client on hold - skip notifications for held clients
        const [userForHoldCheck] = await nativeNotificationUsers(db, [userId]);
        if (userForHoldCheck?.role === 'client' && userForHoldCheck?.holdStatus?.isOnHold) {
            console.log(`[Notification] Skipping notification for client ${userId} - client is on hold`);
            return {
                successCount: 0,
                failureCount: 0,
                invalidTokens: [],
                responses: [],
                skippedNoToken: true,
                errorCode: 'CLIENT_ON_HOLD',
                errorMessage: 'Client is on hold - notifications are suppressed.',
            };
        }

        let notificationRecordId: string | undefined;

        // Save notification to database (unless explicitly disabled)
        if (notification.saveToDb !== false) {
            try {
                const [notificationId] = await saveNativeNotifications(db, [userId], {
                    userId,
                    title: notification.title,
                    message: notification.body,
                    type: mapNotificationType(notification.data?.type),
                    data: notification.data,
                    actionUrl: notification.clickAction,
                    read: false
                });
                notificationRecordId = notificationId;
            } catch (dbError) {
                console.error('Error saving notification to database:', dbError);
                // Continue with push notification even if DB save fails
            }
        }

        const user = userForHoldCheck;
        const tokens = extractValidTokenStrings(user?.fcmTokens);

        if (!user || tokens.length === 0) {
            return {
                successCount: 0,
                failureCount: 0,
                invalidTokens: [],
                responses: [],
                skippedNoToken: true,
                errorCode: 'NO_TOKEN',
                errorMessage: 'No valid FCM tokens are registered for this user.',
            };
        }

        const notificationWithId = {
            ...notification,
            data: {
                ...(notification.data || {}),
                ...(notificationRecordId ? { notificationId: notificationRecordId } : {}),
            },
        };

        return await sendNotificationToTokens(tokens, notificationWithId, userId);
    } catch (error) {
        console.error('Error sending notification to user:', error);
        return { successCount: 0, failureCount: 1, invalidTokens: [], responses: [] };
    }
}

/**
 * Send a push notification to multiple users
 * Also stores the notification in the database for each user
 */
export async function sendNotificationToUsers(
    userIds: string[],
    notification: FCMNotificationPayload
): Promise<SendNotificationResult> {
    try {
        const db = getNativeDatabase();

        const users = (await nativeNotificationUsers(db, userIds))
            .filter(user => !(user.role === 'client' && user.holdStatus?.isOnHold));
        if (notification.saveToDb !== false && users.length) {
            await saveNativeNotifications(db, users.map(user=>user._id), {
                title: notification.title, message: notification.body,
                type: mapNotificationType(notification.data?.type), data: notification.data,
                actionUrl: notification.clickAction,
            });
        }

        const allTokensSet = new Set<string>();
        const tokenOwnerByToken = new Map<string, string>();

        users.forEach((user: any) => {
            const ownerId = String(user?._id || '');
            extractValidTokenStrings(user?.fcmTokens).forEach((token) => {
                allTokensSet.add(token);
                if (ownerId) {
                    tokenOwnerByToken.set(token, ownerId);
                }
            });
        });

        const allTokens = Array.from(allTokensSet);

        if (allTokens.length === 0) {
            return {
                successCount: 0,
                failureCount: 0,
                invalidTokens: [],
                responses: [],
                skippedNoToken: true,
                errorCode: 'NO_TOKEN',
                errorMessage: 'No valid FCM tokens are registered for the selected users.',
            };
        }

        const sendResult = await sendNotificationToTokens(allTokens, notification);

        // For multi-user sends, clean invalid tokens for their corresponding owners.
        if (sendResult.invalidTokens.length > 0) {
            const invalidTokensByUser = new Map<string, string[]>();

            sendResult.invalidTokens.forEach((token) => {
                const ownerId = tokenOwnerByToken.get(token);
                if (!ownerId) return;

                const current = invalidTokensByUser.get(ownerId) || [];
                current.push(token);
                invalidTokensByUser.set(ownerId, current);
            });

            await Promise.all(
                Array.from(invalidTokensByUser.entries()).map(([ownerId, tokensToRemove]) =>
                    removeInvalidTokens(ownerId, tokensToRemove)
                )
            );
        }

        return sendResult;
    } catch (error) {
        console.error('Error sending notification to users:', error);
        return { successCount: 0, failureCount: 1, invalidTokens: [], responses: [] };
    }
}

/**
 * Send notification to specific FCM tokens and handle invalid tokens
 */
async function sendNotificationToTokens(
    tokens: string[],
    notification: FCMNotificationPayload,
    userId?: string
): Promise<SendNotificationResult> {
    const normalizedTokens = Array.from(
        new Set(tokens.map((token) => normalizeTokenValue(token)).filter((token): token is string => Boolean(token)))
    );

    if (normalizedTokens.length === 0) {
        return {
            successCount: 0,
            failureCount: 0,
            invalidTokens: [],
            responses: [],
            skippedNoToken: true,
            errorCode: 'NO_TOKEN',
            errorMessage: 'No valid FCM token values were found to send.',
        };
    }

    if (process.env.NODE_ENV !== 'production') {
        return { successCount: 0, failureCount: 0, invalidTokens: [], responses: [],
            errorCode: 'LOCAL_DELIVERY_DISABLED', errorMessage: 'Live push delivery is disabled during local migration testing.' };
    }

    const messaging = await getMessaging();
    if (!messaging) {
        return {
            successCount: 0,
            failureCount: normalizedTokens.length,
            invalidTokens: [],
            responses: normalizedTokens.map((token) => ({
                token,
                success: false,
                error: 'Firebase messaging not initialized',
            })),
            errorCode: 'FIREBASE_UNAVAILABLE',
            errorMessage: 'Firebase messaging is not initialized on the server.',
        };
    }

    const invalidTokens: string[] = [];
    const responses: Array<{ token: string; success: boolean; error?: string }> = [];
    let successCount = 0;
    let failureCount = 0;

    // Keep routing metadata in the data payload so Android/iOS can deep-link
    // even when the OS, rather than the app, displays the notification.
    const messageData: Record<string, string> = {
        ...(notification.data || {}),
        title: notification.title,
        body: notification.body,
        ...(notification.clickAction
            ? { clickAction: notification.clickAction, url: notification.clickAction }
            : {}),
    };

    // Build the message payload
    const baseMessage = {
        notification: {
            title: notification.title,
            body: notification.body,
            ...(notification.image && { imageUrl: notification.image }),
        },
        data: messageData,
        android: {
            priority: 'high' as const,
            notification: {
                channelId: getAndroidNotificationChannel(notification.data?.type),
                priority: 'high' as const,
                defaultSound: true,
                defaultVibrateTimings: true,
                icon: 'ic_notification',
            },
        },
        webpush: {
            notification: {
                title: notification.title,
                body: notification.body,
                ...(notification.icon && { icon: notification.icon }),
                ...(notification.badge && { badge: notification.badge }),
                ...(notification.image && { image: notification.image }),
            },
            fcmOptions: {
                ...(notification.clickAction && { link: new URL(notification.clickAction, process.env.NEXT_PUBLIC_APP_URL || 'https://www.dtps.tech').href }),
            },
        },
        apns: {
            payload: {
                aps: {
                    alert: {
                        title: notification.title,
                        body: notification.body,
                    },
                    sound: 'default',
                    badge: 1,
                },
            },
        },
    };

    // Send to each token individually for better error handling
    await Promise.all(
        normalizedTokens.map(async (token) => {
            try {
                const message = { ...baseMessage, token };
                try {
                    await messaging.send(message);
                } catch (error: any) {
                    if (error?.code !== 'messaging/mismatched-credential') throw error;
                    const nativeMessaging = await getNativeMessaging();
                    if (!nativeMessaging) throw error;
                    await nativeMessaging.send(message);
                }
                successCount++;
                responses.push({ token, success: true });
            } catch (error: any) {
                failureCount++;
                const errorCode = error?.code || error?.message || 'unknown';
                responses.push({ token, success: false, error: errorCode });

                // Check if token is invalid and should be removed
                if (
                    errorCode === 'messaging/invalid-registration-token' ||
                    errorCode === 'messaging/registration-token-not-registered'
                ) {
                    invalidTokens.push(token);
                }

                console.error('Push delivery failed:', errorCode);
            }
        })
    );

    // Clean up invalid tokens
    if (invalidTokens.length > 0 && userId) {
        await removeInvalidTokens(userId, invalidTokens);
    }
    return { successCount, failureCount, invalidTokens, responses };
}

/**
 * Remove invalid FCM tokens from user's record
 */
async function removeInvalidTokens(userId: string, tokensToRemove: string[]): Promise<void> {
    try {
        const db = getNativeDatabase();
        await removeNativePushTokens(db, userId, tokensToRemove);
    } catch (error) {
        console.error('Error removing invalid tokens:', error);
    }
}

/**
 * Register an FCM token for a user
 */
export async function registerFCMToken(
    userId: string,
    token: string,
    deviceType: 'web' | 'android' | 'ios' = 'web',
    deviceInfo?: string
): Promise<{ success: boolean; message: string }> {
    try {
        const db = getNativeDatabase();

        const normalizedToken = normalizeTokenValue(token);
        if (!normalizedToken) {
            return { success: false, message: 'Invalid token value' };
        }

        const existing = await registerNativePushToken(db, userId, normalizedToken, deviceType, deviceInfo);
        return { success: true, message: existing ? 'Token already registered, updated lastUsed' : 'Token registered successfully' };
    } catch (error) {
        console.error('Error registering FCM token:', error);
        return { success: false, message: 'Failed to register token' };
    }
}

/**
 * Unregister an FCM token (e.g., on logout)
 */
export async function unregisterFCMToken(
    userId: string,
    token: string
): Promise<{ success: boolean; message: string }> {
    try {
        const normalizedToken = normalizeTokenValue(token);
        if (!normalizedToken) {
            return { success: false, message: 'Invalid token value' };
        }

        const db = getNativeDatabase();
        await removeNativePushTokens(db, userId, [normalizedToken]);
        return { success: true, message: 'Token unregistered successfully' };
    } catch (error) {
        console.error('Error unregistering FCM token:', error);
        return { success: false, message: 'Failed to unregister token' };
    }
}

/**
 * Send notification to all users with a specific role
 */
export async function sendNotificationToRole(
    role: string,
    notification: FCMNotificationPayload
): Promise<SendNotificationResult> {
    const messaging = await getMessaging();
    if (!messaging) {
        console.warn('Firebase messaging not initialized');
        return {
            successCount: 0,
            failureCount: 1,
            invalidTokens: [],
            responses: [],
            errorCode: 'FIREBASE_UNAVAILABLE',
            errorMessage: 'Firebase messaging is not initialized on the server.',
        };
    }

    try {
        const db = getNativeDatabase();
        const users = await db.collection('users').where('role', '==', role).select().get();
        const userIds = users.docs.map(doc => doc.id);

        if (userIds.length === 0) {
            return { successCount: 0, failureCount: 0, invalidTokens: [], responses: [] };
        }

        return await sendNotificationToUsers(userIds, notification);
    } catch (error) {
        console.error('Error sending notification to role:', error);
        return { successCount: 0, failureCount: 1, invalidTokens: [], responses: [] };
    }
}

/**
 * Utility: Test Firebase connection
 */
export async function testFirebaseConnection(): Promise<{ success: boolean; message: string }> {
    const messaging = await getMessaging();
    if (!messaging) {
        return { success: false, message: 'Firebase messaging not initialized. Check your environment variables.' };
    }

    try {
        // Test by attempting to get the app
        const app = messaging.app;
        return {
            success: true,
            message: `Firebase connected successfully. Project: ${app.options.projectId}`
        };
    } catch (error: any) {
        return {
            success: false,
            message: `Firebase connection failed: ${error.message}`
        };
    }
}
