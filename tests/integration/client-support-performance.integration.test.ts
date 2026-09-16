import mongoose from 'mongoose';
import '@/lib/db/models/Tag';
import UnifiedPayment from '@/lib/db/models/UnifiedPayment';
import ClientMealPlan from '@/lib/db/models/ClientMealPlan';
import { ServicePlan } from '@/lib/db/models/ServicePlan';
import { createAssignedDietitianClientPair, createUser, ensureDatabaseConnection } from '../utils/database';
import { invokeRoute } from '../utils/routes';
import { UserRole } from '@/types';

beforeEach(ensureDatabaseConnection);

it('returns purchased duration/expiry and the current phase in a lightweight summary', async () => {
  const { client, dietitian } = await createAssignedDietitianClientPair();
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const phaseEnd = new Date(start); phaseEnd.setDate(phaseEnd.getDate() + 9);
  const expiry = new Date(start); expiry.setMonth(expiry.getMonth() + 3);
  const purchaseId = new mongoose.Types.ObjectId();
  await UnifiedPayment.collection.insertOne({ _id: purchaseId, client: client._id, dietitian: dietitian._id,
    planName: 'Weight Loss', durationDays: 90, durationLabel: '3 Months', status: 'paid', paymentStatus: 'paid',
    expectedStartDate: start, expectedEndDate: expiry, createdAt: start });
  await ClientMealPlan.create({ clientId: client._id, dietitianId: dietitian._id, purchaseId,
    name: 'Current detox', startDate: start, endDate: phaseEnd, duration: 10, status: 'active', goals: { primaryGoal: 'health-improvement' } });
  const futureStart = new Date(phaseEnd); futureStart.setDate(futureStart.getDate() + 1);
  await ClientMealPlan.create({ clientId: client._id, dietitianId: dietitian._id, purchaseId,
    name: 'Next phase', startDate: futureStart, endDate: expiry, duration: 20, status: 'active', goals: { primaryGoal: 'health-improvement' } });
  const catalogReads = jest.spyOn(ServicePlan, 'find');
  const route = await import('@/app/api/client/service-plans/route');
  const response = await invokeRoute(route.GET, { method: 'GET', url: 'http://localhost/api/client/service-plans?summary=true', user: client });
  expect(response.status).toBe(200);
  expect(response.json.activePurchases[0]).toMatchObject({ durationLabel: '3 Months', durationDays: 90,
    expectedEndDate: expiry.toISOString(), ongoingMealPlanDuration: 10, mealPlanName: 'Current detox' });
  expect(response.json.nextMealPlan.name).toBe('Next phase');
  expect(catalogReads).not.toHaveBeenCalled();
});

it('filters statuses before loading meal history and populating the requested page', async () => {
  const { dietitian } = await createAssignedDietitianClientPair();
  const otherPair = await createAssignedDietitianClientPair();
  const ids: mongoose.Types.ObjectId[] = [];
  for (let i = 0; i < 6; i++) {
    const user = await createUser({ role: UserRole.CLIENT, firstName: `Page${i}`, assignedDietitian: dietitian._id, clientStatus: 'inactive' });
    ids.push(user._id);
    await UnifiedPayment.collection.insertOne({ client: user._id, status: 'paid', paymentStatus: 'paid', expectedEndDate: new Date('2099-01-01') });
  }
  // This client is active but belongs to a different dietitian.
  await UnifiedPayment.collection.insertOne({ client: otherPair.client._id, status: 'paid', paymentStatus: 'paid', expectedEndDate: new Date('2099-01-01') });
  const history = jest.spyOn(ClientMealPlan, 'aggregate');
  const route = await import('@/app/api/users/clients/route');
  const result = await invokeRoute(route.GET, { method: 'GET', url: 'http://localhost/api/users/clients?status=active&limit=2&page=2', user: dietitian });
  expect(result.status).toBe(200);
  expect(result.json.pagination).toMatchObject({ total: 6, page: 2, limit: 2, pages: 3 });
  expect(result.json.clients.map((client: any) => client.firstName)).toEqual(['Page2', 'Page3']);
  expect(result.json.clients.every((client: any) => client.clientStatus === 'active')).toBe(true);
  const pipeline = history.mock.calls[0][0] as any[];
  expect(pipeline[0].$match.clientId.$in).toHaveLength(2);
  expect(result.json.clients.some((client: any) => client._id === String(otherPair.client._id))).toBe(false);
  await new Promise(resolve => setImmediate(resolve));
});
