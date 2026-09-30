import User from '@/lib/db/models/User';
import Notification from '@/lib/db/models/Notification';
import { createUser, ensureDatabaseConnection } from '../utils/database';
import { UserRole } from '@/types';
import { sendNotificationToUser } from '@/lib/firebase/firebaseNotification';
import { getMessaging, getNativeMessaging } from '@/lib/firebase/firebaseAdmin';
import { invokeRoute } from '../utils/routes';

jest.mock('@/lib/firebase/firebaseAdmin', () => ({ getMessaging: jest.fn(), getNativeMessaging: jest.fn() }));
const primarySend = jest.fn();
const nativeSend = jest.fn();
const payload = { title: 'Meal reminder', body: 'Your meal is ready', icon: '/icons/icon-192x192.png', clickAction: '/user/plan', data: { type: 'meal_photo_prompt' } };

beforeEach(async () => {
  await ensureDatabaseConnection();
  primarySend.mockReset().mockResolvedValue('primary-id');
  nativeSend.mockReset().mockResolvedValue('native-id');
  jest.mocked(getMessaging).mockResolvedValue({ send: primarySend } as any);
  jest.mocked(getNativeMessaging).mockResolvedValue({ send: nativeSend } as any);
});

async function client() {
  return createUser({ role: UserRole.CLIENT, fcmTokens: [{ token: 'existing-android-token', deviceType: 'android' }] } as any);
}

it('retries sender mismatch in the native Firebase project without duplicating the inbox entry', async () => {
  const user = await client();
  primarySend.mockRejectedValue({ code: 'messaging/mismatched-credential' });
  const result = await sendNotificationToUser(String(user._id), payload);
  expect(result.successCount).toBe(1);
  expect(nativeSend).toHaveBeenCalledTimes(1);
  expect(nativeSend.mock.calls[0][0]).toMatchObject({
    token: 'existing-android-token', android: { notification: { icon: 'ic_notification', channelId: 'dtps_tasks' } },
    data: { clickAction: '/user/plan' },
  });
  expect(new URL(nativeSend.mock.calls[0][0].webpush.fcmOptions.link).protocol).toBe('https:');
  expect(await Notification.countDocuments({ userId: user._id })).toBe(1);
  expect((await User.findById(user._id))?.fcmTokens).toHaveLength(1);
});

it('does not retry successful primary sends', async () => {
  const user = await client();
  expect((await sendNotificationToUser(String(user._id), payload)).successCount).toBe(1);
  expect(getNativeMessaging).not.toHaveBeenCalled();
});

it.each(['messaging/invalid-argument', 'messaging/mismatched-credential'])('retains device tokens after %s', async code => {
  const user = await client();
  primarySend.mockRejectedValue({ code });
  jest.mocked(getNativeMessaging).mockResolvedValue(null);
  const result = await sendNotificationToUser(String(user._id), payload);
  expect(result.failureCount).toBe(1);
  expect((await User.findById(user._id))?.fcmTokens).toHaveLength(1);
});

it('removes only definitively unregistered device tokens', async () => {
  const user = await client();
  primarySend.mockRejectedValue({ code: 'messaging/registration-token-not-registered' });
  await sendNotificationToUser(String(user._id), payload);
  expect((await User.findById(user._id))?.fcmTokens).toHaveLength(0);
});

it('saves a validated device timezone during authenticated token registration', async () => {
  const user = await client();
  const route = await import('@/app/api/fcm/token/route');
  const result = await invokeRoute(route.POST, { method: 'POST', url: 'https://dtps.tech/api/fcm/token', user,
    body: { token: 'existing-android-token', deviceType: 'android', timeZone: 'America/New_York' } });
  expect(result.status).toBe(200);
  expect((await User.findById(user._id))?.notificationTimeZone).toBe('America/New_York');
  expect((await User.findById(user._id))?.fcmTokens).toHaveLength(1);
});

it('rejects invalid device timezones and unauthenticated registration', async () => {
  const user = await client();
  const route = await import('@/app/api/fcm/token/route');
  const options = { method: 'POST' as const, url: 'https://dtps.tech/api/fcm/token', user,
    body: { token: 'new-token', deviceType: 'android', timeZone: 'invalid-zone' } };
  expect((await invokeRoute(route.POST, options)).status).toBe(400);
  expect((await invokeRoute(route.POST, { ...options, user: null })).status).toBe(401);
  expect((await User.findById(user._id))?.fcmTokens).toHaveLength(1);
});
