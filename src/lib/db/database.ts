import type { Firestore } from 'firebase-admin/firestore';
import { getMongoNativeDatabase } from './mongo-native';

/** Firebase authentication/push credentials are never used for the business database. */
export function nativeDatabaseSettings(env: Record<string, string | undefined> = process.env) {
  const deployed = Boolean(env.VERCEL) || env.NODE_ENV === 'production';
  if (deployed && env.MONGODB_PRODUCTION_ENABLED !== 'true') {
    throw new Error('MongoDB production cutover has not been enabled');
  }
  if (env.DATABASE_PROVIDER && env.DATABASE_PROVIDER !== 'mongodb') {
    throw new Error('MongoDB is the application database provider');
  }
  const uri = env.MONGODB_URI;
  const databaseId = env.MONGODB_DATABASE;
  if (!uri || !/^mongodb(?:\+srv)?:\/\//.test(uri) || !databaseId || /[\/\\. "$]/.test(databaseId)) {
    throw new Error('Dedicated MongoDB configuration is required');
  }
  return { databaseId, provider: 'mongodb' as const };
}

/** Shared facade keeps existing route contracts while all storage uses MongoDB. */
export function getNativeDatabase(): Firestore {
  nativeDatabaseSettings();
  return getMongoNativeDatabase();
}
