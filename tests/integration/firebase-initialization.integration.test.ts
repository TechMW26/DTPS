import { getFirebaseAdmin, getMessaging } from '@/lib/firebase/firebaseAdmin';
import { initializeApp, cert } from 'firebase-admin/app';
const mockApp = { name: '[DEFAULT]' };
jest.mock('firebase-admin/app', () => ({
  getApps: jest.fn(() => []), getApp: jest.fn(), cert: jest.fn(() => ({})),
  initializeApp: jest.fn(() => mockApp),
}));
jest.mock('firebase-admin/messaging', () => ({ getMessaging: jest.fn(() => ({ send: jest.fn() })) }));

it('shares pending Firebase initialization between concurrent notification sends', async () => {
  const keys = ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY'];
  const original = keys.map(key => process.env[key]);
  process.env.FIREBASE_PROJECT_ID = 'test-project';
  process.env.FIREBASE_CLIENT_EMAIL = 'test@example.com';
  process.env.FIREBASE_PRIVATE_KEY = 'test-key';
  try {
    const apps = await Promise.all([getFirebaseAdmin(), getFirebaseAdmin(), getFirebaseAdmin()]);
    expect(apps).toEqual([mockApp, mockApp, mockApp]);
    expect(initializeApp).toHaveBeenCalledTimes(1);
    expect(cert).toHaveBeenCalledTimes(1);
    expect(await getMessaging()).not.toBeNull();
  } finally {
    keys.forEach((key, i) => { if (original[i] === undefined) delete process.env[key]; else process.env[key] = original[i]; });
  }
});
