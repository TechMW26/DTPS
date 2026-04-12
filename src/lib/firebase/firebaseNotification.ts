import { getMessaging } from './firebaseAdmin';
import User from '@/lib/db/models/User';
import Notification from '@/lib/db/models/Notification';
import connectDB from '@/lib/db/connection';

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
        'payment_link_created': 'payment',
        'custom': 'custom',
    };
    return typeMap[dataType || ''] || 'system';
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
        await connectDB();

        let notificationRecordId: string | undefined;

        // Save notification to database (unless explicitly disabled)
        if (notification.saveToDb !== false) {
            try {
                const savedNotification = await Notification.create({
                    userId,
                    title: notification.title,
                    message: notification.body,
                    type: mapNotificationType(notification.data?.type),
                    data: notification.data,
                    actionUrl: notification.clickAction,
                    read: false
                });
                notificationRecordId = String(savedNotification._id);
            } catch (dbError) {
                console.error('Error saving notification to database:', dbError);
                // Continue with push notification even if DB save fails
            }
        }

        const messaging = await getMessaging();
        if (!messaging) {
            console.warn('Firebase messaging not initialized');
            return { successCount: 0, failureCount: 0, invalidTokens: [], responses: [] };
        }

        const user = await User.findById(userId).select('fcmTokens');

        if (!user || !user.fcmTokens || user.fcmTokens.length === 0) {
            return { successCount: 0, failureCount: 0, invalidTokens: [], responses: [] };
        }

        // Extract all token strings
        const tokens = user.fcmTokens.map((t: any) => t.token);
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
        await connectDB();

        // Save notifications to database for all users (unless explicitly disabled)
        if (notification.saveToDb !== false && userIds.length > 0) {
            try {
                const notificationsToInsert = userIds.map(userId => ({
                    userId,
                    title: notification.title,
                    message: notification.body,
                    type: mapNotificationType(notification.data?.type),
                    data: notification.data,
                    actionUrl: notification.clickAction,
                    read: false
                }));
                await Notification.insertMany(notificationsToInsert);
            } catch (dbError) {
                console.error('Error saving notifications to database:', dbError);
                // Continue with push notifications even if DB save fails
            }
        }

        const messaging = await getMessaging();
        if (!messaging) {
            console.warn('Firebase messaging not initialized');
            return { successCount: 0, failureCount: 0, invalidTokens: [], responses: [] };
        }

        const users = await User.find({ _id: { $in: userIds } }).select('fcmTokens');

        const allTokens: string[] = [];
        const userTokenMap = new Map<string, string>(); // token -> userId

        users.forEach((user: any) => {
            if (user.fcmTokens && user.fcmTokens.length > 0) {
                user.fcmTokens.forEach((t: any) => {
                    allTokens.push(t.token);
                    userTokenMap.set(t.token, user._id.toString());
                });
            }
        });

        if (allTokens.length === 0) {
            return { successCount: 0, failureCount: 0, invalidTokens: [], responses: [] };
        }

        return await sendNotificationToTokens(allTokens, notification);
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
    const messaging = await getMessaging();
    if (!messaging) {
        return { successCount: 0, failureCount: 0, invalidTokens: [], responses: [] };
    }

    const invalidTokens: string[] = [];
    const responses: Array<{ token: string; success: boolean; error?: string }> = [];
    let successCount = 0;
    let failureCount = 0;

    // Build the message payload
    const baseMessage = {
        notification: {
            title: notification.title,
            body: notification.body,
            ...(notification.image && { imageUrl: notification.image }),
        },
        data: notification.data || {},
        android: {
            priority: 'high' as const,
            notification: {
                channelId: 'dtps_notifications',
                priority: 'high' as const,
                defaultSound: true,
                defaultVibrateTimings: true,
                ...(notification.icon && { icon: notification.icon }),
                ...(notification.clickAction && { clickAction: notification.clickAction }),
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
                ...(notification.clickAction && { link: notification.clickAction }),
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
        tokens.map(async (token) => {
            try {
                await messaging!.send({
                    ...baseMessage,
                    token,
                });
                successCount++;
                responses.push({ token, success: true });
            } catch (error: any) {
                failureCount++;
                const errorCode = error?.code || error?.message || 'unknown';
                responses.push({ token, success: false, error: errorCode });

                // Check if token is invalid and should be removed
                if (
                    errorCode === 'messaging/invalid-registration-token' ||
                    errorCode === 'messaging/registration-token-not-registered' ||
                    errorCode.includes('not-registered') ||
                    errorCode.includes('invalid')
                ) {
                    invalidTokens.push(token);
                }

                console.error(`Failed to send to token ${token.substring(0, 20)}...:`, errorCode);
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
        await connectDB();
        await User.findByIdAndUpdate(userId, {
            $pull: { fcmTokens: { token: { $in: tokensToRemove } } },
        });
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
        await connectDB();

        // Check if token already exists for this user
        const existingUser = await User.findOne({
            _id: userId,
            'fcmTokens.token': token,
        });

        if (existingUser) {
            // Update the lastUsed timestamp
            await User.findOneAndUpdate(
                { _id: userId, 'fcmTokens.token': token },
                { $set: { 'fcmTokens.$.lastUsed': new Date() } }
            );
            return { success: true, message: 'Token already registered, updated lastUsed' };
        }

        // Add new token
        await User.findByIdAndUpdate(userId, {
            $push: {
                fcmTokens: {
                    token,
                    deviceType,
                    deviceInfo: deviceInfo || 'Unknown device',
                    createdAt: new Date(),
                    lastUsed: new Date(),
                },
            },
        });

        return { success: true, message: 'Token registered successfully' };
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
        await connectDB();
        await User.findByIdAndUpdate(userId, {
            $pull: { fcmTokens: { token } },
        });
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
        return { successCount: 0, failureCount: 0, invalidTokens: [], responses: [] };
    }

    try {
        await connectDB();
        const users = await User.find({ role }).select('_id fcmTokens');
        const userIds = users.map((u: any) => u._id.toString());

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
