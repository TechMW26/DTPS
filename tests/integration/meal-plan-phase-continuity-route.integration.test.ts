/// <reference types="jest" />

import { POST } from '@/app/api/client-meal-plans/route';
import ClientMealPlan from '@/lib/db/models/ClientMealPlan';
import UnifiedPayment from '@/lib/db/models/UnifiedPayment';
import { createAssignedDietitianClientPair, ensureDatabaseConnection } from '../utils/database';
import { invokeRoute } from '../utils/routes';

jest.mock('@/lib/utils/activityLogger', () => ({
  logActivity: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/lib/firebase/firebaseNotification', () => ({
  sendNotificationToUser: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/lib/status/computeClientStatus', () => ({
  updateClientStatusFromMealPlan: jest.fn().mockResolvedValue('active'),
}));

const publishableMeals = [{
  date: '2026-09-01',
  day: 'Day 1',
  meals: {
    BREAKFAST: {
      foodOptions: [{ food: 'Oats with milk' }],
    },
  },
}];

describe('POST /api/client-meal-plans phase continuity', () => {
  beforeEach(async () => {
    await ensureDatabaseConnection();
  });

  it('rejects a later phase that leaves an unexplained gap', async () => {
    const { client, dietitian } = await createAssignedDietitianClientPair();
    const purchase = await UnifiedPayment.create({
      client: client._id,
      dietitian: dietitian._id,
      planName: '180 Day Weight Loss',
      planCategory: 'weight-loss',
      durationDays: 180,
      durationLabel: '180 Days',
      status: 'paid',
      paymentStatus: 'paid',
      expectedStartDate: new Date('2026-07-20T00:00:00.000Z'),
      expectedEndDate: new Date('2027-01-16T00:00:00.000Z'),
      remainingDays: 137,
      mealPlanCreated: true,
    });

    await ClientMealPlan.create({
      clientId: client._id,
      dietitianId: dietitian._id,
      purchaseId: purchase._id,
      phaseNumber: 2,
      phaseTag: 'PHASE-2',
      name: 'Phase 2',
      startDate: new Date('2026-08-08T00:00:00.000Z'),
      endDate: new Date('2026-08-21T00:00:00.000Z'),
      duration: 14,
      status: 'active',
      meals: publishableMeals,
      goals: { primaryGoal: 'weight-loss' },
    });

    const result = await invokeRoute(POST, {
      method: 'POST',
      url: 'http://localhost/api/client-meal-plans',
      user: dietitian.toObject(),
      body: {
        clientId: String(client._id),
        purchaseId: String(purchase._id),
        name: 'Phase 3',
        startDate: '2026-09-01',
        endDate: '2026-09-15',
        duration: 15,
        status: 'active',
        meals: publishableMeals,
      },
    });

    expect(result.status).toBe(409);
    expect(result.json).toMatchObject({
      code: 'PHASE_START_MUST_FOLLOW_PREVIOUS',
      expectedStartDate: '2026-08-22',
      proposedStartDate: '2026-09-01',
      gapDays: 10,
    });
    await expect(ClientMealPlan.countDocuments({ purchaseId: purchase._id }))
      .resolves.toBe(1);
  });
});
