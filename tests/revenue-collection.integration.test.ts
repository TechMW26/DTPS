import {nativeRevenueCollection} from '@/lib/db/repository/native-revenue-collection';

type Row = Record<string, unknown>;
function fakeDb(rows: Row[]) {
 const calls: unknown[][] = [];
 const query = {
  where: (...args: unknown[]) => { calls.push(['where', ...args]); return query; },
  select: (...fields: unknown[]) => { calls.push(['select', ...fields]); return query; },
  get: async () => {
   const since = calls.find(call => call[0] === 'where')?.[3] as Date;
   return {docs: rows.filter(row => (row.createdAt as Date) >= since).map(row => ({get: (field: string) => row[field]}))};
  },
 };
 return {db: {collection: (name: string) => { calls.push(['collection', name]); return query; }} as never, calls};
}

const ist = (value: string) => new Date(`${value}+05:30`);
const now = ist('2026-11-24T12:00:00');

test('splits the last 12 IST months into billed, collected and pending', async () => {
 const {db, calls} = fakeDb([
  {status: 'paid', paymentStatus: 'paid', finalAmount: 4700, createdAt: ist('2026-11-03T10:00:00')},
  {status: 'pending', paymentStatus: 'pending', finalAmount: 5500.4, createdAt: ist('2026-11-20T10:00:00')},
  {status: 'completed', baseAmount: 1000, createdAt: ist('2026-10-01T00:05:00')},
  // 31 Oct 23:00 IST is still October even though it is 31 Oct 17:30 UTC
  {status: 'paid', paymentStatus: 'paid', amount: 200, createdAt: ist('2026-10-31T23:00:00')},
  // 1 Nov 00:30 IST is November even though it is still 31 Oct in UTC
  {status: 'paid', paymentStatus: 'paid', amount: 300, createdAt: ist('2026-11-01T00:30:00')},
  {status: 'cancelled', finalAmount: 9999, createdAt: ist('2026-11-05T10:00:00')},
  {status: 'paid', paymentStatus: 'paid', finalAmount: 777, createdAt: ist('2025-11-30T10:00:00')}, // older than 12 months
 ]);
 const result = await nativeRevenueCollection(db, now);
 expect(result.months).toHaveLength(12);
 expect(result.months[0].key).toBe('2025-12');
 expect(result.months[11].key).toBe('2026-11');
 const nov = result.months[11], oct = result.months[10];
 expect(nov).toMatchObject({month: 'Nov', collected: 5000, pending: 5500, billed: 10500, collectedCount: 2, pendingCount: 1, billedCount: 3});
 expect(oct).toMatchObject({month: 'Oct', collected: 1200, pending: 0, billed: 1200});
 expect(result.totals).toEqual({billed: 11700, collected: 6200, pending: 5500, pendingCount: 1, collectionRate: 53});
 expect(calls).toContainEqual(['collection', 'unifiedpayments']);
 expect(calls).toContainEqual(['where', 'createdAt', '>=', ist('2025-12-01T00:00:00')]);
});

test('returns twelve empty months and a zero rate when there are no payments', async () => {
 const result = await nativeRevenueCollection(fakeDb([]).db, now);
 expect(result.months.every(month => month.billed === 0 && month.collected === 0)).toBe(true);
 expect(result.totals.collectionRate).toBe(0);
});

test('handles a January start correctly', async () => {
 const result = await nativeRevenueCollection(fakeDb([]).db, ist('2026-01-10T09:00:00'));
 expect(result.months[0].key).toBe('2025-02');
 expect(result.months[11]).toMatchObject({key: '2026-01', month: 'Jan', year: 2026});
});
