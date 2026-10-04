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

});
