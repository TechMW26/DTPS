import {nativeDashboardSavedAlerts} from '@/lib/db/repository/native-system-alerts';

function fakeDb(rows: Array<Record<string, unknown>>) {
 const calls: unknown[][] = [];
 const query = {
  where: (...args: unknown[]) => { calls.push(['where', ...args]); return query; },
  orderBy: (...args: unknown[]) => { calls.push(['orderBy', ...args]); return query; },
  limit: (...args: unknown[]) => { calls.push(['limit', ...args]); return query; },
  get: async () => {
   const since = calls.find(call => call[0] === 'where')?.[3] as Date;
   return {docs: rows.filter(row => (row.createdAt as Date) >= since).map(row => ({id: row.id, get: (field: string) => row[field], data: () => row}))};
  },
 };
 return {db: {collection: (name: string) => { calls.push(['collection', name]); return query; }} as never, calls};
}

const now = new Date('2026-11-24T10:00:00Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * 86400000);

test('dashboard alerts skip old logs and resolved or ignored alerts', async () => {
 const {db, calls} = fakeDb([
  {id: 'new', message: 'Payment webhook failed', status: 'new', createdAt: daysAgo(1)},
  {id: 'ack', message: 'Seen but open', status: 'acknowledged', createdAt: daysAgo(6)},
  {id: 'nostatus', message: 'Old style alert', createdAt: daysAgo(2)},
  {id: 'done', message: 'Fixed already', status: 'resolved', createdAt: daysAgo(1)},
  {id: 'ignored', message: 'Ignored', status: 'ignored', createdAt: daysAgo(1)},
  {id: 'old', message: 'listen EADDRINUSE: address already in use 0.0.0.0:3000', status: 'new', createdAt: daysAgo(111)},
 ]);
 const rows = await nativeDashboardSavedAlerts(db, now);
 expect(rows.map(row => row.id)).toEqual(['new', 'ack', 'nostatus']);
 expect(calls).toContainEqual(['collection', 'systemalerts']);
 expect(calls).toContainEqual(['where', 'createdAt', '>=', daysAgo(7)]);
 expect(calls).toContainEqual(['orderBy', 'createdAt', 'desc']);
 expect(calls).toContainEqual(['limit', 50]);
});
