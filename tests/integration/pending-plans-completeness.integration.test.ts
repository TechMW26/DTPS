/// <reference types="jest" />

import UnifiedPayment from '@/lib/db/models/UnifiedPayment';
import { UserStatus } from '@/types';
import { entityId } from '../utils/assertions';
import { createAssignedDietitianClientPair, ensureDatabaseConnection } from '../utils/database';
import { invokeRoute } from '../utils/routes';

describe('pending plans completeness', () => {
  beforeEach(async () => {
    await ensureDatabaseConnection();
  });

  it('includes assigned inactive clients with paid allocations still needing a plan', async () => {
    const { client, dietitian } = await createAssignedDietitianClientPair();
    client.status = UserStatus.INACTIVE;
    await client.save();

    await UnifiedPayment.create({
      client: client._id,
      dietitian: dietitian._id,
      planName: 'Completed Payment Allocation',
      durationDays: 30,
      durationLabel: '30 Days',
      status: 'completed',
      paymentStatus: 'paid',
      daysUsed: 0,
      mealPlanCreated: false,
    });

    const route = await import('@/app/api/dashboard/pending-plans/route');
    const result = await invokeRoute(route.GET, {
      method: 'GET',
      url: 'http://localhost/api/dashboard/pending-plans',
      user: dietitian,
    });

    expect(result.status).toBe(200);
    expect(result.json.pendingPlans).toEqual([
      expect.objectContaining({
        clientId: entityId(client),
        purchasedPlanName: 'Completed Payment Allocation',
        pendingDaysToCreate: 30,
        reason: 'no_meal_plan',
      }),
    ]);
  });
});
