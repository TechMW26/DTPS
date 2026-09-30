import type { App, ServiceAccount } from 'firebase-admin/app';
import type { Messaging } from 'firebase-admin/messaging';

let firebaseAdminInstance: App | null = null;
let messagingInstance: Messaging | null = null;
let initialization: Promise<App | null> | null = null;

// Initialize Firebase Admin SDK (singleton pattern with lazy loading)
const initializeFirebaseAdmin = (): Promise<App | null> => {
    if (initialization) return initialization;
    initialization = initializeDefaultApp();
    void initialization.then(app => { if (!app) initialization = null; });
    return initialization;
};

const initializeDefaultApp = async (): Promise<App | null> => {
    if (firebaseAdminInstance) {
        return firebaseAdminInstance;
    }

    // Check for required environment variables
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY;

    if (!projectId || !clientEmail || !privateKey) {
        console.warn('Firebase Admin SDK not initialized: Missing credentials');
        console.warn('Required: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY');
        return null;
    }

    try {
        // Dynamic import to avoid Turbopack bundling issues
        const { initializeApp, getApps, cert, getApp } = await import('firebase-admin/app');

        if (getApps().some(app => app.name === '[DEFAULT]')) {
            firebaseAdminInstance = getApp();
            return firebaseAdminInstance;
        }

        const credential: ServiceAccount = {
            projectId,
            clientEmail,
            // Handle the escaped newlines in the private key
            privateKey: privateKey.replace(/\\n/g, '\n'),
        };

        firebaseAdminInstance = initializeApp({
            projectId,
            credential: cert(credential),
        });

        return firebaseAdminInstance;
    } catch (error) {
        console.error('Failed to initialize Firebase Admin SDK:', error);
        return null;
    }
};

// Get messaging instance (lazy initialization)
export const getMessaging = async (): Promise<Messaging | null> => {
    if (messagingInstance) {
        return messagingInstance;
    }

    const app = await initializeFirebaseAdmin();
    if (!app) {
        return null;
    }

    try {
        const { getMessaging } = await import('firebase-admin/messaging');
        messagingInstance = getMessaging(app);
        return messagingInstance;
    } catch (error) {
        console.error('Failed to get Firebase Messaging:', error);
        return null;
    }
};

// Export the initialization function
export const getFirebaseAdmin = initializeFirebaseAdmin;

let nativeInitialization: Promise<Messaging | null> | null = null;
// Existing Android releases use another sender. Keep web/auth credentials intact
// and use the configured native project only for sender-mismatch retries.
export function getNativeMessaging(): Promise<Messaging | null> {
    if (nativeInitialization) return nativeInitialization;
    const projectId = process.env.FIREBASE_NATIVE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_NATIVE_CLIENT_EMAIL || process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_NATIVE_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY;
    if (!projectId || !clientEmail || !privateKey) return Promise.resolve(null);
    nativeInitialization = (async () => {
        try {
            const { initializeApp, getApps, cert } = await import('firebase-admin/app');
            const { getMessaging } = await import('firebase-admin/messaging');
            const app = getApps().find(app => app.name === 'dtps-native-push') || initializeApp({
                projectId,
                credential: cert({ projectId, clientEmail, privateKey: privateKey.replace(/\\n/g, '\n') }),
            }, 'dtps-native-push');
            return getMessaging(app);
        } catch {
            console.error('Failed to initialize native Firebase messaging');
            return null;
        }
    })();
    void nativeInitialization.then(value => { if (!value) nativeInitialization = null; });
    return nativeInitialization;
}

// For backwards compatibility - these will be null until initialized
export const firebaseAdmin = null;
export const messaging = null;

export default null;
