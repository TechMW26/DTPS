'use client';

// Firebase SDK imports are lazy-loaded to prevent crashes when env vars are missing.
// The SDK calls .split() on authDomain at import time, which throws if undefined.
type FirebaseApp = import('firebase/app').FirebaseApp;
type Messaging = import('firebase/messaging').Messaging;

// Firebase configuration from environment variables
const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

/**
 * Returns true when the minimum required Firebase config values are present.
 */
function isFirebaseConfigValid(): boolean {
    return !!(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId);
}

// VAPID key for web push
function normalizeVapidKey(rawKey?: string): string | null {
    if (!rawKey) return null;

    // Remove wrapping quotes/newlines and normalize to URL-safe base64.
    const cleaned = rawKey
        .trim()
        .replace(/^['"]|['"]$/g, '')
        .replace(/\s+/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');

    return cleaned || null;
}

function isLikelyValidVapidPublicKey(key: string): boolean {
    try {
        const base64 = key.replace(/-/g, '+').replace(/_/g, '/');
        const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
        const decoded = atob(padded);

        // Public key is expected to be uncompressed P-256 point (65 bytes) or longer.
        return decoded.length >= 65;
    } catch {
        return false;
    }
}

const vapidKey = normalizeVapidKey(process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY);

let firebaseApp: FirebaseApp | null = null;
let messaging: Messaging | null = null;
let currentToken: string | null = null;

/**
 * Initialize Firebase app (client-side only)
 */
export async function initializeFirebaseApp(): Promise<FirebaseApp | null> {
    if (typeof window === 'undefined') {
        return null;
    }

    if (firebaseApp) {
        return firebaseApp;
    }

    // Check if all required config values exist BEFORE importing the SDK
    if (!isFirebaseConfigValid()) {
        console.warn('Firebase config incomplete. Push notifications will not work.');
        return null;
    }

    try {
        const { initializeApp, getApps } = await import('firebase/app');

        if (getApps().length === 0) {
            firebaseApp = initializeApp(firebaseConfig);
        } else {
            firebaseApp = getApps()[0];
        }

        return firebaseApp;
    } catch (error) {
        console.error('Error initializing Firebase app:', error);
        return null;
    }
}

/**
 * Get Firebase Messaging instance
 */
export async function getFirebaseMessaging(): Promise<Messaging | null> {
    if (typeof window === 'undefined') {
        return null;
    }

    if (messaging) {
        return messaging;
    }

    if (!isFirebaseConfigValid()) {
        return null;
    }

    const app = await initializeFirebaseApp();
    if (!app) {
        return null;
    }

    // Check if the browser supports notifications
    if (!('Notification' in window)) {
        console.warn('This browser does not support notifications');
        return null;
    }

    // Check if service workers are supported
    if (!('serviceWorker' in navigator)) {
        console.warn('Service workers are not supported');
        return null;
    }

    try {
        const { getMessaging } = await import('firebase/messaging');
        messaging = getMessaging(app);
        return messaging;
    } catch (error) {
        console.error('Error initializing Firebase Messaging:', error);
        return null;
    }
}

/**
 * Request notification permission
 */
export async function requestNotificationPermission(): Promise<'granted' | 'denied' | 'default'> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
        return 'denied';
    }

    try {
        const permission = await Notification.requestPermission();
        return permission;
    } catch (error) {
        console.error('Error requesting notification permission:', error);
        return 'denied';
    }
}

/**
 * Get FCM token for push notifications
 */
export async function getFCMToken(): Promise<string | null> {
    if (currentToken) {
        return currentToken;
    }

    const messagingInstance = await getFirebaseMessaging();
    if (!messagingInstance) {
        console.warn('Firebase Messaging not available');
        return null;
    }

    if (!vapidKey) {
        console.error('VAPID key not configured');
        return null;
    }

    if (!isLikelyValidVapidPublicKey(vapidKey)) {
        console.warn('Invalid NEXT_PUBLIC_FIREBASE_VAPID_KEY. Please copy the Web Push certificate key from Firebase console.');
        return null;
    }

    try {
        // Request notification permission first
        const permission = await requestNotificationPermission();
        if (permission !== 'granted') {
            console.warn('Notification permission not granted');
            return null;
        }

        // Wait for service worker registration
        const registration = await navigator.serviceWorker.ready;

        const { getToken } = await import('firebase/messaging');

        // Get FCM token
        const token = await getToken(messagingInstance, {
            vapidKey,
            serviceWorkerRegistration: registration,
        });

        if (token) {
            currentToken = token;
            return token;
        } else {
            console.warn('No FCM token available');
            return null;
        }
    } catch (error: any) {
        const message = typeof error?.message === 'string' ? error.message : 'Unknown error';
        const errorName = typeof error?.name === 'string' ? error.name : '';

        if (errorName === 'InvalidAccessError' || message.toLowerCase().includes('applicationserverkey')) {
            console.warn('Failed to subscribe for push notifications due to invalid VAPID key configuration.');
            return null;
        }

        console.error('Error getting FCM token:', message);
        return null;
    }
}

/**
 * Register FCM token with backend
 */
export async function registerFCMTokenWithBackend(): Promise<boolean> {
    try {
        const token = await getFCMToken();
        if (!token) {
            return false;
        }

        // Detect device type
        const deviceType = detectDeviceType();
        const deviceInfo = getDeviceInfo();

        const response = await fetch('/api/fcm/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                token,
                deviceType,
                deviceInfo,
            }),
        });

        const result = await response.json();

        if (result.success) {
            return true;
        } else {
            console.error('Failed to register FCM token:', result.error);
            return false;
        }
    } catch (error) {
        console.error('Error registering FCM token:', error);
        return false;
    }
}

/**
 * Unregister FCM token (call on logout)
 */
export async function unregisterFCMToken(): Promise<boolean> {
    if (!currentToken) {
        return true; // Nothing to unregister
    }

    try {
        const response = await fetch('/api/fcm/token', {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                token: currentToken,
            }),
        });

        const result = await response.json();

        if (result.success) {
            currentToken = null;
            return true;
        } else {
            console.error('Failed to unregister FCM token:', result.error);
            return false;
        }
    } catch (error) {
        console.error('Error unregistering FCM token:', error);
        return false;
    }
}

/**
 * Set up foreground message listener
 */
export async function onForegroundMessage(callback: (payload: any) => void): Promise<(() => void) | null> {
    const messagingInstance = await getFirebaseMessaging();
    if (!messagingInstance) {
        console.warn('Firebase Messaging not available for foreground listener');
        return null;
    }

    console.log('[fcmHelper] Setting up foreground message listener');

    const { onMessage } = await import('firebase/messaging');

    const unsubscribe = onMessage(messagingInstance, (payload) => {
        console.log('[fcmHelper] Foreground message received:', {
            title: payload.notification?.title,
            body: payload.notification?.body,
            type: payload.data?.type,
        });
        callback(payload);
    });

    return unsubscribe;
}

/**
 * Show a notification using the Notification API
 */
export function showNotification(title: string, options?: NotificationOptions): void {
    if (typeof window === 'undefined' || !('Notification' in window)) {
        return;
    }

    if (Notification.permission === 'granted') {
        new Notification(title, {
            icon: '/icons/icon-192x192.png',
            badge: '/icons/icon-72x72.png',
            ...options,
        });
    }
}

/**
 * Detect device type
 */
function detectDeviceType(): 'web' | 'android' | 'ios' {
    if (typeof window === 'undefined') {
        return 'web';
    }

    const userAgent = navigator.userAgent.toLowerCase();

    if (/android/i.test(userAgent)) {
        return 'android';
    }

    if (/iphone|ipad|ipod/i.test(userAgent)) {
        return 'ios';
    }

    return 'web';
}

/**
 * Get device information for token registration
 */
function getDeviceInfo(): string {
    if (typeof window === 'undefined') {
        return 'Unknown device';
    }

    const userAgent = navigator.userAgent;
    const platform = navigator.platform || 'Unknown';

    return `${platform} - ${userAgent.substring(0, 100)}`;
}

/**
 * Check if push notifications are supported
 */
export function isPushNotificationSupported(): boolean {
    if (typeof window === 'undefined') {
        return false;
    }

    return (
        'Notification' in window &&
        'serviceWorker' in navigator &&
        'PushManager' in window
    );
}

/**
 * Check current notification permission
 */
export function getNotificationPermission(): NotificationPermission | 'unsupported' {
    if (typeof window === 'undefined' || !('Notification' in window)) {
        return 'unsupported';
    }

    return Notification.permission;
}
