import "server-only";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getDatabaseWithUrl } from "firebase-admin/database";
import type { Database } from "firebase-admin/database";

let rtdbInstance: Database | null = null;
let initError: string | null = null;
const RTDB_APP_NAME = "dtps-rtdb";

/**
 * Initialize Firebase Realtime Database (singleton).
 * Uses a dedicated Firebase Admin app so RTDB can live in a different Firebase
 * project from FCM without invalidating existing mobile push tokens.
 */
export async function getRTDB(): Promise<Database | null> {
  if (rtdbInstance) return rtdbInstance;
  if (initError) return null;

  try {
    const databaseURL = process.env.FIREBASE_DATABASE_URL;
    const projectId = process.env.FIREBASE_RTDB_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_RTDB_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_RTDB_PRIVATE_KEY?.replace(/\\n/g, "\n");

    if (!databaseURL || !projectId || !clientEmail || !privateKey) {
      initError = "RTDB credentials are incomplete";
      console.warn(`[RTDB] ${initError}`);
      return null;
    }

    const existingApp = getApps().find((candidate) => candidate.name === RTDB_APP_NAME);
    const app = existingApp || initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
    }, RTDB_APP_NAME);

    rtdbInstance = getDatabaseWithUrl(databaseURL, app);
    console.log("[RTDB] Dedicated database app initialized");
    return rtdbInstance;
  } catch (error) {
    initError = `RTDB initialization failed: ${error instanceof Error ? error.message : "Unknown error"}`;
    console.error(`[RTDB] ${initError}`);
    return null;
  }
}

/**
 * Get a reference to a path in the RTDB.
 * Returns null if RTDB is not initialized (graceful degradation).
 */
export async function refAtPath(path: string) {
  const db = await getRTDB();
  if (!db) return null;
  return db.ref(path);
}

/**
 * Check if RTDB is healthy.
 */
export async function checkRTDBHealth(): Promise<boolean> {
  try {
    const db = await getRTDB();
    if (!db) return false;
    // Firebase Admin rejects the client-only `.info/connected` path. A read
    // against a reserved, intentionally empty application path validates the
    // database URL, service-account credentials, and network connectivity
    // without downloading collection data.
    await db.ref("v2/__health").get();
    return true;
  } catch {
    return false;
  }
}

export default getRTDB;
