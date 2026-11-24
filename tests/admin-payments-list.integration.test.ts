import {nativeAdminPayments} from '@/lib/db/repository/native-admin-payments';

/** Records every query the admin payment list builds, so filters and paging can be checked without a database. */
function fakeDb(counts: {matching?: number} = {}) {
 const chains: unknown[][][] = [];
 // Like the real driver, every call returns a new query; the original is never changed.
 const makeQuery = (calls: unknown[][]): Record<string, unknown> => {
  const query: Record<string, unknown> = {};
  for (const method of ['where', 'orderBy', 'offset', 'limit', 'select']) query[method] = (...args: unknown[]) => { const next = [...calls, [method, ...args]]; chains.push(next); return makeQuery(next); };
  query.count = () => ({get: async () => ({data: () => ({count: calls.length === 1 ? 9999 : counts.matching ?? 7})})});
  query.get = async () => ({docs: [], size: 0});
  return query;
 };
 const db = {
  collection: (name: string) => {
   const calls: unknown[][] = [['collection', name]];
   chains.push(calls);
   const query = makeQuery(calls);
   query.doc = (id: string) => ({get: async () => ({exists: true, id, get: (field: string) => ({role: 'admin', status: 'active'} as Record<string, string>)[field]})});
   return query;
  },
  getAll: async () => [],
 };
 return {db: db as never, chains};
}

const listQuery = (chains: unknown[][][]) => chains.filter(calls => calls.some(call => call[0] === 'offset')).sort((a, b) => b.length - a.length)[0];

test('pages with skip and limit and reports the total for the current filter', async () => {
 const {db, chains} = fakeDb({matching: 9605});
 const result = await nativeAdminPayments(db, 'admin1', new URLSearchParams('limit=10&skip=20&status=pending'));
 const calls = listQuery(chains);
 expect(calls).toContainEqual(['orderBy', 'createdAt', 'desc']);
 expect(calls).toContainEqual(['offset', 20]);
 expect(calls).toContainEqual(['limit', 10]);
 expect(result.pagination).toEqual({skip: 20, limit: 10, total: 9605});
 expect(result.payments).toEqual([]);
});

test('without parameters it behaves exactly as before (latest 100, no filters)', async () => {
 const {db, chains} = fakeDb();
 await nativeAdminPayments(db, 'admin1', new URLSearchParams(''));
 const calls = listQuery(chains);
 expect(calls).toContainEqual(['offset', 0]);
 expect(calls).toContainEqual(['limit', 100]);
 expect(calls.filter(call => call[0] === 'where')).toEqual([]);
});

test('"completed" also matches payments stored as paid', async () => {
 const {db, chains} = fakeDb();
 await nativeAdminPayments(db, 'admin1', new URLSearchParams('status=completed'));
 expect(listQuery(chains)).toContainEqual(['where', 'status', 'in', ['paid', 'completed']]);
});

test('other statuses, type and date filters are applied on the server', async () => {
 const {db, chains} = fakeDb();
 await nativeAdminPayments(db, 'admin1', new URLSearchParams('status=pending&type=subscription&since=2026-11-01T00:00:00.000Z'));
 const calls = listQuery(chains);
 expect(calls).toContainEqual(['where', 'status', '==', 'pending']);
 expect(calls).toContainEqual(['where', 'paymentType', '==', 'subscription']);
 expect(calls).toContainEqual(['where', 'createdAt', '>=', new Date('2026-11-01T00:00:00.000Z')]);
});

test('an invalid date or out-of-range paging is ignored safely', async () => {
 const {db, chains} = fakeDb();
 await nativeAdminPayments(db, 'admin1', new URLSearchParams('since=not-a-date&limit=5000&skip=-4'));
 const calls = listQuery(chains);
 expect(calls.some(call => call[0] === 'where' && call[1] === 'createdAt')).toBe(false);
 expect(calls).toContainEqual(['limit', 200]);
 expect(calls).toContainEqual(['offset', 0]);
});
