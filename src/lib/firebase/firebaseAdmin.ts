import type { App, AppOptions, ServiceAccount } from 'firebase-admin/app';
import type { Messaging } from 'firebase-admin/messaging';

let firebaseAdminInstance: App | null = null;
let messagingInstance: Messaging | null = null;
let initialized = false;

// Initialize Firebase Admin SDK (singleton pattern with lazy loading)
const initializeFirebaseAdmin = async (): Promise<App | null> => {
    if (initialized) {
        return firebaseAdminInstance;
    }

    initialized = true;

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

        if (getApps().length > 0) {
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

// For backwards compatibility - these will be null until initialized
export const firebaseAdmin = null;
export const messaging = null;

export default null;
