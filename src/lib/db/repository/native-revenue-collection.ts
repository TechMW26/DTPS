import type {MongoDatabase} from '@/lib/db/mongo-types';

const IST_MONTH = new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit'});
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const PENDING = new Set(['pending', 'created', 'partially_paid']);

const asDate = (value: unknown): Date | null => {
 if (!value) return null;
 const date = value instanceof Date ? value : typeof (value as {toDate?: () => Date}).toDate === 'function' ? (value as {toDate: () => Date}).toDate() : new Date(value as string);
 return Number.isNaN(date.getTime()) ? null : date;
};
const amountOf = (row: {get(field: string): unknown}) => {
 const amount = Number(row.get('finalAmount') ?? row.get('baseAmount') ?? row.get('amount') ?? 0);
 return Number.isFinite(amount) ? amount : 0;
};
/** Same rule the admin stats use for "paid". */
const isPaid = (row: {get(field: string): unknown}) => row.get('paymentStatus') === 'paid' || ['paid', 'completed'].includes(String(row.get('status') ?? ''));
const isPending = (row: {get(field: string): unknown}) => PENDING.has(String(row.get('status') ?? '')) || PENDING.has(String(row.get('paymentStatus') ?? ''));

export interface RevenueCollectionMonth {
 key: string; month: string; year: number;
 billed: number; collected: number; pending: number;
 billedCount: number; collectedCount: number; pendingCount: number;
}

/** Last 12 IST months, from the month a payment was created: billed (paid + pending), collected (paid), pending. Read-only. */
export async function nativeRevenueCollection(db: MongoDatabase, now = new Date()) {
 const [year, month] = IST_MONTH.format(now).split('-').map(Number);
 const months: RevenueCollectionMonth[] = Array.from({length: 12}, (_, index) => {
  const offset = year * 12 + (month - 1) - (11 - index), y = Math.floor(offset / 12), m = offset % 12;
  return {key: `${y}-${String(m + 1).padStart(2, '0')}`, month: MONTH_NAMES[m], year: y, billed: 0, collected: 0, pending: 0, billedCount: 0, collectedCount: 0, pendingCount: 0};
 });
 const byKey = new Map(months.map(row => [row.key, row]));
 const since = new Date(`${months[0].key}-01T00:00:00+05:30`);
 const rows = await db.collection('unifiedpayments').where('createdAt', '>=', since)
  .select('status', 'paymentStatus', 'finalAmount', 'baseAmount', 'amount', 'createdAt').get();
 for (const row of rows.docs) {
  const created = asDate(row.get('createdAt'));
  const target = created ? byKey.get(IST_MONTH.format(created)) : undefined;
  if (!target) continue;
  const amount = amountOf(row);
  if (isPaid(row)) { target.collected += amount; target.collectedCount++; }
  else if (isPending(row)) { target.pending += amount; target.pendingCount++; }
  else continue; // cancelled, failed or refunded payments are not billed
  target.billed += amount; target.billedCount++;
 }
 for (const row of months) { row.billed = Math.round(row.billed); row.collected = Math.round(row.collected); row.pending = Math.round(row.pending); }
 const totals = months.reduce((sum, row) => ({
  billed: sum.billed + row.billed, collected: sum.collected + row.collected,
  pending: sum.pending + row.pending, pendingCount: sum.pendingCount + row.pendingCount,
 }), {billed: 0, collected: 0, pending: 0, pendingCount: 0});
 return {months, totals: {...totals, collectionRate: totals.billed > 0 ? Math.round((totals.collected / totals.billed) * 1000) / 10 : 0}};
}
