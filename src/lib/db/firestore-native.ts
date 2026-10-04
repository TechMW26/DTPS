import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

const APP_NAME = 'dtps-native-database';

/** Database credentials stay separate from Firebase authentication and push projects. */
export function nativeDatabaseSettings(env: Record<string, string | undefined> = process.env) {
  const deployed = Boolean(env.VERCEL) || env.NODE_ENV === 'production';
  if (deployed && env.FIRESTORE_NATIVE_PRODUCTION_ENABLED !== 'true') {
    throw new Error('Native Firestore production cutover has not been enabled');
  }
  const emulator = env.FIRESTORE_EMULATOR_HOST;
  if (emulator) {
    if (deployed) throw new Error('Deployed applications cannot use a Firestore emulator');
    if (!/^(localhost|127\.0\.0\.1|\[::1\]):\d+$/.test(emulator)) {
      throw new Error('Firestore emulator must be on localhost');
    }
    const projectId = env.FIRESTORE_NATIVE_PROJECT_ID || 'demo-dtps-native';
    if (!projectId.startsWith('demo-')) throw new Error('Local emulator tests require a demo project');
    return { projectId, databaseId: '(default)', emulator };
  }
  const projectId = env.FIRESTORE_NATIVE_PROJECT_ID;
  const databaseId = env.FIRESTORE_NATIVE_DATABASE_ID;
  const clientEmail = env.FIRESTORE_NATIVE_CLIENT_EMAIL;
  const privateKey = env.FIRESTORE_NATIVE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!projectId || !databaseId || !clientEmail || !privateKey) {
    throw new Error('Dedicated native Firestore configuration is required');
  }
  if (databaseId !== 'dtps-native-staging' || projectId !== 'dtps-2cbac') {
    throw new Error('The verified native Firestore database is required');
  }
  return { projectId, databaseId, clientEmail, privateKey };
}

export function getNativeDatabaseApp() {
  const settings = nativeDatabaseSettings();
  const existing = getApps().find(app => app.name === APP_NAME);
  if (existing && existing.options.projectId !== settings.projectId) {
    throw new Error('Native database project changed: restart the local process');
  }
  const app = existing || initializeApp({
    projectId: settings.projectId,
    ...(!settings.emulator ? { credential: cert({
      projectId: settings.projectId,
      clientEmail: settings.clientEmail!,
      privateKey: settings.privateKey!,
    }) } : {}),
  }, APP_NAME);
  return app;
}

export function getNativeDatabase(): Firestore {
  const settings = nativeDatabaseSettings();
  return getFirestore(getNativeDatabaseApp(), settings.databaseId);
}
