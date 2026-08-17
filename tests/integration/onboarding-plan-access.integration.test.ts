import ClientMealPlan from '@/lib/db/models/ClientMealPlan';
import User from '@/lib/db/models/User';
import {
  grantDietPlanAccess,
  grantDietPlanAccessIfPublished,
  hasPublishedMealPlan,
} from '@/lib/auth/onboarding-access';
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

    await expect(hasPublishedMealPlan(String(client._id))).resolves.toBe(true);
  });

  it('keeps the override after a published chart has expired', async () => {
    const { client, dietitian } = await createAssignedDietitianClientPair();

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

    await expect(grantDietPlanAccessIfPublished(String(client._id))).resolves.toBe(true);
    const updatedClient = await User.exists({ _id: client._id, onboardingCompleted: true });
    expect(updatedClient).not.toBeNull();
  });

  it('marks a client complete as soon as a diet is deliberately published', async () => {
    const { client } = await createAssignedDietitianClientPair();

    await grantDietPlanAccess(String(client._id));

    const updatedClient = await User.exists({ _id: client._id, onboardingCompleted: true });
    expect(updatedClient).not.toBeNull();
  });

  it('preserves the override after a published diet is cancelled', async () => {
    const { client, dietitian } = await createAssignedDietitianClientPair();
    await ClientMealPlan.create({
      clientId: client._id,
      dietitianId: dietitian._id,
      name: 'Previously published plan',
      status: 'cancelled',
      startDate: new Date('2026-08-01T00:00:00.000Z'),
      endDate: new Date('2026-08-10T00:00:00.000Z'),
      duration: 10,
      goals: { primaryGoal: 'weight-loss' },
    });

    await expect(grantDietPlanAccessIfPublished(String(client._id))).resolves.toBe(true);
  });

  it('does not clear onboarding for a diet that remains a draft', async () => {
    const { client, dietitian } = await createAssignedDietitianClientPair();
    await ClientMealPlan.create({
      clientId: client._id,
      dietitianId: dietitian._id,
      name: 'Unpublished draft',
      status: 'draft',
      startDate: new Date('2026-08-20T00:00:00.000Z'),
      endDate: new Date('2026-08-29T00:00:00.000Z'),
      duration: 10,
      goals: { primaryGoal: 'weight-loss' },
    });

    await expect(grantDietPlanAccessIfPublished(String(client._id))).resolves.toBe(false);
    await expect(User.exists({
      _id: client._id,
      onboardingCompleted: true,
    })).resolves.toBeNull();
  });
});
