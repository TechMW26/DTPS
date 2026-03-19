// Re-export all Firebase notification functions
export {
    sendNotificationToUser,
    sendNotificationToUsers,
    sendNotificationToRole,
    registerFCMToken,
    unregisterFCMToken,
    testFirebaseConnection,
    type FCMNotificationPayload,
    type SendNotificationResult,
} from './firebaseNotification';

export { getFirebaseAdmin, getMessaging } from './firebaseAdmin';
