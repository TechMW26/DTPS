import request from 'supertest';
import { getServerSession } from 'next-auth';
import ClientMealPlan from '@/lib/db/models/ClientMealPlan';
import UnifiedPayment from '@/lib/db/models/UnifiedPayment';
import { createAssignedDietitianClientPair, createUser } from '../utils/database';
import { createRouteTestServer } from '../utils/supertest-route';
import { UserRole } from '@/types';

// Exercise actual MongoDB commits, retries and rollback rather than mocking transactions.
process.env.DTPS_TEST_REPLICA_SET = '1';
afterAll(() => { delete process.env.DTPS_TEST_REPLICA_SET; });
jest.mock('@/lib/utils/activityLogger', () => ({ logActivity: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/lib/firebase/firebaseNotification', () => ({ sendNotificationToUser: jest.fn() }));
jest.mock('@/lib/status/computeClientStatus', () => ({ updateClientStatusFromMealPlan: jest.fn() }));

async function fixture() {
  const { client, dietitian } = await createAssignedDietitianClientPair();
  const admin = await createUser({ role: UserRole.ADMIN });
  (getServerSession as jest.Mock).mockResolvedValue({ user: { id: String(admin._id), role: 'admin' } });
  const purchase = await UnifiedPayment.create({
    client: client._id, dietitian: dietitian._id, planName: '90-day program',
    planCategory: 'weight-loss', durationDays: 90, durationLabel: '90 Days',
    status: 'paid', paymentStatus: 'paid', daysUsed: 20, remainingDays: 70,
    mealPlanCreated: true, expectedEndDate: new Date('2040-12-31'),
  });
  const createPlan = (status = 'active', duration = 10) => ClientMealPlan.create({
    clientId: client._id, dietitianId: dietitian._id, purchaseId: purchase._id,
    name: 'Phase', status, duration, startDate: new Date('2040-01-01'),
    // Extended calendar window must not refund more than the allocated duration.
    endDate: new Date('2040-01-15'), meals: [], goals: { primaryGoal: 'weight-loss' },
  });
  const first = await createPlan();
  const second = await createPlan();
  await UnifiedPayment.updateOne({ _id: purchase._id }, {
    $set: { linkedMealPlanIds: [first._id, second._id], mealPlan: first._id },
  });
  return { purchase, first, second, createPlan };
}

async function remove(id: string) {
  const route = await import('@/app/api/client-meal-plans/[id]/route');
  const server = createRouteTestServer(req => route.DELETE(req, { params: Promise.resolve({ id }) }));
  try { return await request(server).delete(`/api/client-meal-plans/${id}`); }
  finally { server.close(); }
}

it('returns allocation to the same program and keeps other phases, dates and purchases intact', async () => {
  const { purchase, first, second } = await fixture();
  const unrelated = await fixture();
  const response = await remove(String(first._id));
  expect(response.status).toBe(200);
  expect(response.body.restoredDays).toBe(10);
  const updated = await UnifiedPayment.findById(purchase._id).lean();
  expect(updated).toMatchObject({ daysUsed: 10, remainingDays: 80, durationDays: 90, mealPlanCreated: true });
  expect(updated!.expectedEndDate).toEqual(purchase.expectedEndDate);
  expect(updated!.linkedMealPlanIds?.map(String)).toEqual([String(second._id)]);
  expect(String(updated!.mealPlan)).toBe(String(second._id));
  expect((await remove(String(first._id))).status).toBe(404);
  expect((await UnifiedPayment.findById(purchase._id))!.remainingDays).toBe(80);
  expect(await UnifiedPayment.findById(unrelated.purchase._id).lean()).toMatchObject({ daysUsed: 20, remainingDays: 70 });
});

it('keeps allocation for a surviving legacy phase without a stored duration', async () => {
  const { purchase, first, second } = await fixture();
  await ClientMealPlan.updateOne({ _id: second._id }, {
    $unset: { duration: 1 }, $set: { endDate: new Date('2040-01-10') },
  });
  expect((await remove(String(first._id))).status).toBe(200);
  expect(await UnifiedPayment.findById(purchase._id).lean()).toMatchObject({ daysUsed: 10, remainingDays: 80 });
});

it('returns the full balance after deleting the final phase, including concurrent requests', async () => {
  const { purchase, first, second } = await fixture();
  const results = await Promise.all([remove(String(first._id)), remove(String(second._id))]);
  expect(results.map(r => r.status)).toEqual([200, 200]);
  const updated = await UnifiedPayment.findById(purchase._id).lean();
  expect(updated).toMatchObject({ daysUsed: 0, remainingDays: 90, mealPlanCreated: false, mealPlan: null });
  expect(updated!.linkedMealPlanIds).toHaveLength(0);
});

it('does not double-credit simultaneous deletion of the same phase', async () => {
  const { purchase, first } = await fixture();
  const results = await Promise.all([remove(String(first._id)), remove(String(first._id))]);
  expect(results.map(r => r.status).sort()).toEqual([200, 404]);
  expect((await UnifiedPayment.findById(purchase._id))!.remainingDays).toBe(80);
});

it('does not return days for a draft that never consumed allocation', async () => {
  const { purchase, createPlan } = await fixture();
  const draft = await createPlan('draft', 30);
  const response = await remove(String(draft._id));
  expect(response.status).toBe(200);
  expect(response.body.restoredDays).toBe(0);
  expect(await UnifiedPayment.findById(purchase._id).lean()).toMatchObject({ daysUsed: 20, remainingDays: 70 });
});

it('rolls back the deletion if the linked program cannot be reconciled', async () => {
  const { purchase, first } = await fixture();
  await UnifiedPayment.deleteOne({ _id: purchase._id });
  expect((await remove(String(first._id))).status).toBe(409);
  expect(await ClientMealPlan.findById(first._id).lean()).toMatchObject({ status: 'active' });
});

it('rolls back when the purchase write fails', async () => {
  const { purchase, first } = await fixture();
  const write = jest.spyOn(UnifiedPayment, 'updateOne').mockRejectedValueOnce(new Error('Simulated write failure'));
  try { expect((await remove(String(first._id))).status).toBe(500); }
  finally { write.mockRestore(); }
  expect(await ClientMealPlan.findById(first._id).lean()).toMatchObject({ status: 'active' });
  expect(await UnifiedPayment.findById(purchase._id).lean()).toMatchObject({ daysUsed: 20, remainingDays: 70 });
});
