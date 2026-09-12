import { withJsonCache, invalidateJsonCacheTag } from '@/lib/cache/json-cache';
import { redisConfigured, redisOperation } from '@/lib/cache/redis';

jest.mock('@/lib/cache/redis', () => ({
  redisConfigured: jest.fn(() => true), redisNamespace: () => 'dtps:test:v1', redisOperation: jest.fn(),
}));

describe('distributed JSON cache', () => {
  let values: Map<string, string>;
  let client: any;
  beforeEach(() => {
    values = new Map();
    client = {
      mget: jest.fn(async (...keys: string[]) => keys.map(k => values.get(k) ?? null)),
      get: jest.fn(async (key: string) => values.get(key) ?? null),
      set: jest.fn(async (key: string, value: string) => { values.set(key, value); return 'OK'; }),
      incr: jest.fn(async (key: string) => { const n = Number(values.get(key) || 0) + 1; values.set(key, String(n)); return n; }),
    };
    (redisConfigured as jest.Mock).mockReturnValue(true);
    (redisOperation as jest.Mock).mockImplementation(fn => fn(client));
  });
  it('reuses JSON across reads, coalesces a burst, and bounds expiry', async () => {
    const load = jest.fn(async () => ({ count: 42 }));
    const results = await Promise.all(Array.from({ length: 20 }, () => withJsonCache('catalog', load, { tags: ['recipes'], ttl: 300_000 })));
    expect(load).toHaveBeenCalledTimes(1);
    expect(results[0]).toEqual({ count: 42 });
    expect(await withJsonCache('catalog', load, { tags: ['recipes'] })).toEqual({ count: 42 });
    expect(load).toHaveBeenCalledTimes(1);
    expect(client.set.mock.calls[0].slice(2)).toEqual(['PX', 30_000]);
  });
  it('invalidates across workers and does not let an old in-flight read resurrect stale data', async () => {
    let finish!: (v: { count: number }) => void;
    const oldRead = withJsonCache('race', () => new Promise<{ count: number }>(resolve => { finish = resolve; }), { tags: ['recipes'] });
    while (!finish) await Promise.resolve();
    await invalidateJsonCacheTag('recipes');
    expect(await withJsonCache('race', async () => ({ count: 2 }), { tags: ['recipes'] })).toEqual({ count: 2 });
    finish({ count: 1 }); await oldRead;
    expect(await withJsonCache('race', async () => ({ count: 3 }), { tags: ['recipes'] })).toEqual({ count: 2 });
  });
  it('separates authorization scopes and ignores corrupt cached values', async () => {
    expect(await withJsonCache('client:public', async () => ['published'])).toEqual(['published']);
    expect(await withJsonCache('admin:includeInactive', async () => ['draft'])).toEqual(['draft']);
    for (const key of values.keys()) values.set(key, 'broken JSON');
    expect(await withJsonCache('client:public', async () => ['fresh'])).toEqual(['fresh']);
  });
  it('fails open when Redis is unavailable, and never stores failed reads or oversized payloads', async () => {
    (redisOperation as jest.Mock).mockResolvedValue(null);
    expect(await withJsonCache('offline', async () => 7, { tags: ['recipes'] })).toBe(7);
    expect(client.set).not.toHaveBeenCalled();
    (redisOperation as jest.Mock).mockImplementation(fn => fn(client));
    await expect(withJsonCache('error', async () => { throw new Error('database failed'); })).rejects.toThrow('database failed');
    await withJsonCache('large', async () => 'x'.repeat(600_000));
    expect(client.set).not.toHaveBeenCalled();
  });
  it('invalidates cached directory summaries after actual model writes', async () => {
    const { ensureDatabaseConnection, createUser } = await import('../utils/database');
    const { UserRole } = await import('@/types');
    const { default: User } = await import('@/lib/db/models/User');
    const { getUserDirectorySummary } = await import('@/lib/services/user-directory-summary');
    await ensureDatabaseConnection();
    const user = await createUser({ role: UserRole.CLIENT });
    const first = await getUserDirectorySummary();
    await User.updateOne({ _id: user._id }, { $set: { clientId: 'C-90001' } });
    const second = await getUserDirectorySummary();
    expect(second.latestClientIdNumber).toBe(90001);
    expect(second.latestClientIdNumber).not.toBe(first.latestClientIdNumber);
    await User.deleteOne({ _id: user._id });
    expect((await getUserDirectorySummary()).clientsCount).toBe(0);
  });

  it('isolates recipe visibility and invalidates cached searches on recipe edits', async () => {
    const { createAssignedDietitianClientPair, ensureDatabaseConnection } = await import('../utils/database');
    const { default: Recipe } = await import('@/lib/db/models/Recipe');
    const { invokeRoute } = await import('../utils/routes');
    const { GET } = await import('@/app/api/recipes/route');
    await ensureDatabaseConnection();
    const { dietitian, client: patient } = await createAssignedDietitianClientPair();
    const recipe = await Recipe.create({ name: 'Cache Soup', description: 'Soup',
      ingredients: [{ name: 'Carrot', quantity: 100, unit: 'g' }], instructions: ['Boil and serve'],
      prepTime: 5, cookTime: 10, servings: 1, calories: 50, protein: 2, carbs: 10, fat: 1,
      createdBy: dietitian._id, isActive: false,
    });
    const read = (user: any, includeInactive: boolean) => invokeRoute(GET, { method: 'GET', user,
      url: `http://localhost/api/recipes?exactName=Cache%20Soup&limit=10&includeInactive=${includeInactive}` });
    expect((await read(dietitian, true)).json.recipes).toHaveLength(1);
    expect((await read(dietitian, false)).json.recipes).toHaveLength(0);
    expect((await read(patient, true)).json.recipes).toHaveLength(0);
    await Recipe.findByIdAndUpdate(recipe._id, { $set: { isActive: true } }, { runValidators: true });
    const published = await read(patient, false);
    expect(published.status).toBe(200);
    expect(published.json.recipes).toHaveLength(1);
    expect(published.response.headers.get('Server-Timing')).toMatch(/app;dur=/);
    await Recipe.deleteOne({ _id: recipe._id });
    expect((await read(patient, false)).json.recipes).toHaveLength(0);
  });

});
