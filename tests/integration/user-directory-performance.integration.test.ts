import User from '@/lib/db/models/User';
import UnifiedPayment from '@/lib/db/models/UnifiedPayment';
import { UserRole } from '@/types';
import { createAssignedDietitianClientPair, createUser, ensureDatabaseConnection } from '../utils/database';
import { invokeRoute } from '../utils/routes';

beforeEach(ensureDatabaseConnection);

it('filters computed statuses before paging, fetches only page profiles, and performs no read-time writes', async () => {
  const admin = await createUser({ role: UserRole.ADMIN });
  const { client, dietitian } = await createAssignedDietitianClientPair();
  await createUser({ role: UserRole.CLIENT, clientStatus: 'active' }); // stale active status, actually a lead
  const second = await createUser({ role: UserRole.CLIENT, clientStatus: 'lead' });
  for (const active of [client, second]) {
    await UnifiedPayment.create({
      client: active._id, dietitian: dietitian._id, status: 'paid', paymentStatus: 'paid',
      planName: 'Active purchase', durationDays: 30, durationLabel: '30 Days',
      expectedEndDate: new Date(Date.now() + 30 * 86_400_000),
    });
  }
  const write = jest.spyOn(User, 'findByIdAndUpdate');
  const find = jest.spyOn(User, 'find');
  const { GET } = await import('@/app/api/users/route');
  const results = [];
  for (const page of [1, 2]) {
    const result = await invokeRoute(GET, { method: 'GET',
      url: `http://localhost/api/users?role=client&status=active&limit=1&page=${page}`, user: admin });
    expect(result.status).toBe(200);
    expect(result.json.pagination).toMatchObject({ total: 2, pages: 2, limit: 1 });
    expect(result.json.users).toHaveLength(1);
    expect(result.json.users[0].clientStatus).toBe('active');
    results.push(result.json.users[0]._id);
  }
  expect(new Set(results)).toEqual(new Set([String(client._id), String(second._id)]));
  expect(write).not.toHaveBeenCalled();
  const pageQueries = find.mock.results.filter(({ value }) => value.getFilter()._id?.$in?.length === 1);
  expect(pageQueries.length).toBeGreaterThanOrEqual(2);
});

it('keeps separate dietitian directories scoped to their assigned clients', async () => {
  const first = await createAssignedDietitianClientPair();
  const second = await createAssignedDietitianClientPair();
  const { GET } = await import('@/app/api/users/route');
  // invokeRoute mocks a global session; use sequential requests to ensure the
  // assertions exercise each user's authorization independently.
  for (const pair of [first, second]) {
    const result = await invokeRoute(GET, { method: 'GET',
      url: 'http://localhost/api/users?role=client&limit=50', user: pair.dietitian });
    expect(result.status).toBe(200);
    expect(result.json.users.map((user: { _id: string }) => user._id)).toEqual([String(pair.client._id)]);
    expect(result.json.users[0]).not.toHaveProperty('password');
  }
});

it.each(['0', '-1', 'invalid'])('rejects invalid page size %s instead of running an unbounded query', async limit => {
  const admin = await createUser({ role: UserRole.ADMIN });
  const { GET } = await import('@/app/api/users/route');
  const result = await invokeRoute(GET, { method: 'GET', url: `http://localhost/api/users?limit=${limit}`, user: admin });
  expect(result.status).toBe(400);
});
