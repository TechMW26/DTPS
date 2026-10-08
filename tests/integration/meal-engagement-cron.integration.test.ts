import { NextRequest } from 'next/server';
import { GET, POST } from '@/app/api/internal/meal-engagement/route';
import { runMealEngagementNotifications } from '@/lib/notifications/mealEngagement';
jest.mock('@/lib/notifications/mealEngagement', () => ({ runMealEngagementNotifications: jest.fn() }));

beforeEach(() => {
  process.env.CRON_SECRET = 'test-cron-secret';
  jest.mocked(runMealEngagementNotifications).mockResolvedValue({ plans: 1, due: 1, sent: 1, failed: 0, duplicates: 0, discoveryCached: false, plansLoaded: 1 });
});
afterEach(() => { delete process.env.CRON_SECRET; });

it('rejects anonymous and incorrect cron credentials without dispatching notifications', async () => {
  for (const authorization of ['', 'Bearer wrong']) {
    expect((await GET(new NextRequest('https://dtps.tech/api/internal/meal-engagement', { headers: { authorization } }))).status).toBe(401);
  }
  delete process.env.CRON_SECRET;
  expect((await GET(new NextRequest('https://dtps.tech/api/internal/meal-engagement'))).status).toBe(401);
  expect(runMealEngagementNotifications).not.toHaveBeenCalled();
});

it('runs Vercel GET cron and preserves the authenticated POST runner', async () => {
  expect((await GET(new NextRequest('https://dtps.tech/api/internal/meal-engagement', { headers: { authorization: 'Bearer test-cron-secret' } }))).status).toBe(200);
  expect((await POST(new NextRequest('https://dtps.tech/api/internal/meal-engagement', { method: 'POST', headers: { authorization: 'Bearer test-cron-secret' } }))).status).toBe(200);
  expect(runMealEngagementNotifications).toHaveBeenCalledTimes(2);
});
