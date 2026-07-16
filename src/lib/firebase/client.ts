// Client-side Firebase helpers for push notifications
export {
    initializeFirebaseApp,
    getFirebaseMessaging,
    getFCMToken,
    requestNotificationPermission,
    registerFCMTokenWithBackend,
    unregisterFCMToken,
    onForegroundMessage,
    showNotification,
    isPushNotificationSupported,
    getNotificationPermission,
} from './fcmHelper';
