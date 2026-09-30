import ClientMealPlan from '@/lib/db/models/ClientMealPlan';
import MealEngagementDispatch from '@/lib/db/models/MealEngagementDispatch';
import User from '@/lib/db/models/User';
import { createAssignedDietitianClientPair, ensureDatabaseConnection } from '../utils/database';
import { runMealEngagementNotifications, getPlanMealSchedules } from '@/lib/notifications/mealEngagement';
import { sendNotificationToUser } from '@/lib/firebase/firebaseNotification';
jest.mock('@/lib/firebase/firebaseNotification', () => ({ sendNotificationToUser: jest.fn() }));

beforeEach(async () => {
  await ensureDatabaseConnection();
  jest.mocked(sendNotificationToUser).mockResolvedValue({ successCount: 1, failureCount: 0, invalidTokens: [], responses: [] });
});

async function fixture(zone = 'Australia/Sydney') {
  const { client, dietitian } = await createAssignedDietitianClientPair();
  await User.updateOne({ _id: client._id }, { $set: { notificationTimeZone: zone } });
  const plan = await ClientMealPlan.create({ clientId: client._id, dietitianId: dietitian._id,
    name: 'Local reminder plan', status: 'active', startDate: '2026-09-30T00:00:00+05:30', endDate: '2026-09-30T23:59:59+05:30',
    duration: 1, goals: { primaryGoal: 'health-improvement' },
    meals: [{ date: '2026-09-30T00:00:00+05:30', meals: { DINNER: { time: '07:00 PM', foods: [{ name: 'Paneer' }] } } }],
  });
  return { client, plan };
}

it('sends at the client-local meal time, not IST, and deduplicates overlapping cron runs', async () => {
  await fixture();
  const now = new Date('2026-09-30T09:00:00Z'); // 7 PM Sydney; 2:30 PM India
  const summaries = await Promise.all([runMealEngagementNotifications(now), runMealEngagementNotifications(now)]);
  expect(summaries.reduce((sum, s) => sum + s.sent, 0)).toBe(1);
  expect(sendNotificationToUser).toHaveBeenCalledTimes(1);
  expect(await MealEngagementDispatch.countDocuments({ status: 'sent' })).toBe(1);
  expect((await runMealEngagementNotifications(new Date('2026-09-30T13:30:00Z'))).due).toBe(0);
});

it('records provider failures as failed instead of reporting that reminders were delivered', async () => {
  await fixture();
  jest.mocked(sendNotificationToUser).mockResolvedValue({ successCount: 0, failureCount: 1, invalidTokens: [], responses: [{ token: 'private-token', success: false, error: 'messaging/mismatched-credential' }] });
  const result = await runMealEngagementNotifications(new Date('2026-09-30T09:00:00Z'));
  expect(result).toMatchObject({ sent: 0, failed: 1 });
  const record = await MealEngagementDispatch.findOne().lean() as { status: string; result: { providerErrors: string[] } } | null;
  expect(record?.status).toBe('failed');
  expect(record?.result.providerErrors).toEqual(['messaging/mismatched-credential']);
  expect(JSON.stringify(record)).not.toContain('private-token');
});

it('respects held accounts and clients who disabled reminders', async () => {
  const { client } = await fixture();
  await User.updateOne({ _id: client._id }, { $set: { 'holdStatus.isOnHold': true } });
  expect((await runMealEngagementNotifications(new Date('2026-09-30T09:00:00Z'))).due).toBe(0);
  await User.updateOne({ _id: client._id }, { $set: { 'holdStatus.isOnHold': false, 'settings.mealReminders': false } });
  expect((await runMealEngagementNotifications(new Date('2026-09-30T09:00:00Z'))).due).toBe(0);
  expect(sendNotificationToUser).not.toHaveBeenCalled();
});

it('uses the stored calendar date for sparse plans and does not repeat missing days', async () => {
  const { plan } = await fixture();
  const data = plan.toObject();
  data.startDate = new Date('2026-09-29T00:00:00+05:30');
  expect(getPlanMealSchedules(data, '2026-09-30')).toHaveLength(1);
  data.endDate = new Date('2026-10-01T23:59:59+05:30');
  expect(getPlanMealSchedules(data, '2026-10-01')).toHaveLength(0);
});
