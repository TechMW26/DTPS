import ClientMealPlan from '@/lib/db/models/ClientMealPlan';
import '@/lib/db/models/DietTemplate';
import '@/lib/db/models/Tag';
import { PUT } from '@/app/api/client-meal-plans/[id]/route';
import { createAssignedDietitianClientPair, ensureDatabaseConnection } from '../utils/database';
import { invokeRouteWithParams } from '../utils/routes';

jest.mock('@/lib/utils/activityLogger', () => ({ logActivity: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/lib/firebase/firebaseNotification', () => ({ sendNotificationToUser: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/lib/status/computeClientStatus', () => ({ updateClientStatusFromMealPlan: jest.fn().mockResolvedValue('active') }));

const meals = (food: string) => [{
  date: '2026-09-16', day: 'Day 1',
  meals: { BREAKFAST: { foodOptions: [{ food, foods: [{ food, name: food }] }] } },
}];

describe('meal plan concurrent publication', () => {
  beforeEach(ensureDatabaseConnection);
  afterEach(() => jest.restoreAllMocks());

  async function setup(status = 'draft') {
    const { client, dietitian } = await createAssignedDietitianClientPair();
    const plan = await ClientMealPlan.create({
      clientId: client._id, dietitianId: dietitian._id, name: 'Concurrent plan',
      startDate: new Date('2026-09-16'), endDate: new Date('2026-09-16'),
      duration: 1, status, meals: meals('Original breakfast'),
      goals: { primaryGoal: 'weight-loss' },
    });
    return { plan, dietitian };
  }

  // Return the snapshot the request read, but commit another request before
  // this request validates/writes. Real Mongo writes exercise the atomic guard.
  function commitAfterRead(plan: any, update: any) {
    const snapshot = plan;
    jest.spyOn(ClientMealPlan, 'findOne').mockImplementationOnce((() => ({
      then: (resolve: any, reject: any) => ClientMealPlan.collection.updateOne(
        { _id: plan._id }, update,
      ).then(() => resolve(snapshot), reject),
    })) as any);
  }

  async function update(plan: any, dietitian: any, body: any) {
    return invokeRouteWithParams(PUT, {
      method: 'PUT', url: `http://localhost/api/client-meal-plans/${plan.id}`,
      params: { id: plan.id }, user: dietitian, body,
    });
  }

  it('rejects an autosave that read draft before publication, preserving published meals', async () => {
    const { plan, dietitian } = await setup();
    const publishedAt = new Date();
    commitAfterRead(plan, { $set: {
      status: 'active', meals: meals('Published breakfast'), firstPublishedAt: publishedAt,
      lastPublishedAt: publishedAt, updatedAt: new Date(plan.updatedAt.getTime() + 1),
    } });
    const result = await update(plan, dietitian, { status: 'draft', meals: [] });
    expect(result.status).toBe(409);
    expect(result.json.code).toBe('PLAN_WRITE_CONFLICT');
    const saved: any = await ClientMealPlan.findById(plan._id).lean();
    expect(saved.status).toBe('active');
    expect(saved.meals[0].meals.BREAKFAST.foodOptions[0].food).toBe('Published breakfast');
    expect(saved.firstPublishedAt).toEqual(publishedAt);
  });

  it('rejects an overlapping content write even when status has not changed', async () => {
    const { plan, dietitian } = await setup('active');
    commitAfterRead(plan, { $set: { meals: meals('Newer breakfast') }, $inc: { __v: 1 } });
    const result = await update(plan, dietitian, { meals: meals('Stale breakfast') });
    expect(result.status).toBe(409);
    const saved: any = await ClientMealPlan.findById(plan._id).lean();
    expect(saved.meals[0].meals.BREAKFAST.foodOptions[0].food).toBe('Newer breakfast');
  });

  it('does not publish an empty draft', async () => {
    const { plan, dietitian } = await setup();
    const result = await update(plan, dietitian, { status: 'active', meals: [] });
    expect(result.status).toBe(400);
    expect((await ClientMealPlan.findById(plan._id))?.status).toBe('draft');
  });

  it.each([{}, { status: 'active' }])('rejects reusing a published phase for later dates (%j)', async (status) => {
    const { plan, dietitian } = await setup('active');
    const result = await update(plan, dietitian, {
      ...status, startDate: '2026-09-26', endDate: '2026-09-26',
    });
    expect(result.status).toBe(409);
    expect(result.json.code).toBe('PUBLISHED_START_DATE_LOCKED');
    const saved = await ClientMealPlan.findById(plan._id);
    expect(saved?.startDate).toEqual(plan.startDate);
    expect(saved?.meals).toEqual(plan.meals);
  });
});
