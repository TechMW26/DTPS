import ClientMealPlan from '@/lib/db/models/ClientMealPlan';
import { hasCurrentOrUpcomingMealPlan } from '@/lib/auth/onboarding-access';
import {
  createAssignedDietitianClientPair,
  ensureDatabaseConnection,
} from '../utils/database';

describe('onboarding plan access', () => {
  beforeEach(async () => {
    await ensureDatabaseConnection();
  });

  it('allows an incomplete migrated client to access a current assigned chart', async () => {
    const { client, dietitian } = await createAssignedDietitianClientPair();
    const now = new Date('2026-08-17T08:00:00.000Z');

    await ClientMealPlan.create({
      clientId: client._id,
      dietitianId: dietitian._id,
      name: 'Current assigned plan',
      status: 'active',
      startDate: new Date('2026-08-16T00:00:00.000Z'),
      endDate: new Date('2026-08-25T00:00:00.000Z'),
      duration: 10,
      goals: { primaryGoal: 'weight-loss' },
    });

    await expect(hasCurrentOrUpcomingMealPlan(String(client._id), now)).resolves.toBe(true);
  });

  it('does not bypass onboarding for an expired chart', async () => {
    const { client, dietitian } = await createAssignedDietitianClientPair();
    const now = new Date('2026-08-17T08:00:00.000Z');

    await ClientMealPlan.create({
      clientId: client._id,
      dietitianId: dietitian._id,
      name: 'Expired plan',
      status: 'completed',
      startDate: new Date('2026-08-01T00:00:00.000Z'),
      endDate: new Date('2026-08-10T00:00:00.000Z'),
      duration: 10,
      goals: { primaryGoal: 'weight-loss' },
    });

    await expect(hasCurrentOrUpcomingMealPlan(String(client._id), now)).resolves.toBe(false);
  });
});
