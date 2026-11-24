import type {MongoDatabase} from '@/lib/db/mongo-types';

const IST_MONTH = new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit'});
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const PENDING = new Set(['pending', 'created', 'partially_paid']);
/** Payment links expire 7 days after they are made, so an older unpaid payment is no longer collectable. */
export const LINK_VALID_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

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
/** A saved expiry date wins; otherwise the link lasts LINK_VALID_DAYS from when it was made. */
const isStillCollectable = (row: {get(field: string): unknown}, created: Date, now: Date) => {
 const expiry = asDate(row.get('expireDate')) ?? asDate(row.get('expiryDate')) ?? asDate(row.get('expiresAt')) ?? new Date(created.getTime() + LINK_VALID_DAYS * DAY_MS);
 return expiry.getTime() >= now.getTime();
};

export interface RevenueCollectionMonth {
 key: string; month: string; year: number;
 billed: number; collected: number; pending: number;
 billedCount: number; collectedCount: number; pendingCount: number;
 /** Every payment asked for in the month, paid or not (expired links included). */
 revenue: number; revenueCount: number;
}

/** Last 12 IST months, from the month a payment was created: revenue (everything asked for, expired links included), billed (paid + still-collectable pending), collected (paid), pending (still collectable). Read-only. */
export async function nativeRevenueCollection(db: MongoDatabase, now = new Date()) {
 const [year, month] = IST_MONTH.format(now).split('-').map(Number);
 const months: RevenueCollectionMonth[] = Array.from({length: 12}, (_, index) => {
  const offset = year * 12 + (month - 1) - (11 - index), y = Math.floor(offset / 12), m = offset % 12;
  return {key: `${y}-${String(m + 1).padStart(2, '0')}`, month: MONTH_NAMES[m], year: y, billed: 0, collected: 0, pending: 0, billedCount: 0, collectedCount: 0, pendingCount: 0, revenue: 0, revenueCount: 0};
 });
 const byKey = new Map(months.map(row => [row.key, row]));
 const since = new Date(`${months[0].key}-01T00:00:00+05:30`);
 const rows = await db.collection('unifiedpayments').where('createdAt', '>=', since)
  .select('status', 'paymentStatus', 'finalAmount', 'baseAmount', 'amount', 'createdAt', 'expireDate', 'expiryDate', 'expiresAt').get();
 let expired = 0, expiredCount = 0;
 for (const row of rows.docs) {
  const created = asDate(row.get('createdAt'));
  const target = created ? byKey.get(IST_MONTH.format(created)) : undefined;
  if (!target) continue;
  const amount = amountOf(row);
  if (isPaid(row) || isPending(row)) { target.revenue += amount; target.revenueCount++; }
  if (isPaid(row)) { target.collected += amount; target.collectedCount++; }
  else if (isPending(row)) {
   if (!created || !isStillCollectable(row, created, now)) { expired += amount; expiredCount++; continue; } // link expired: not billed, not pending
   target.pending += amount; target.pendingCount++;
  }
  else continue; // cancelled, failed or refunded payments are not billed
  target.billed += amount; target.billedCount++;
 }
 for (const row of months) { row.revenue = Math.round(row.revenue); row.billed = Math.round(row.billed); row.collected = Math.round(row.collected); row.pending = Math.round(row.pending); }
 const totals = months.reduce((sum, row) => ({
  billed: sum.billed + row.billed, collected: sum.collected + row.collected,
  pending: sum.pending + row.pending, pendingCount: sum.pendingCount + row.pendingCount, revenue: sum.revenue + row.revenue,
 }), {billed: 0, collected: 0, pending: 0, pendingCount: 0, revenue: 0});
 return {months, totals: {...totals, expired: Math.round(expired), expiredCount,
  collectionRate: totals.billed > 0 ? Math.round((totals.collected / totals.billed) * 1000) / 10 : 0,
  revenueCollectionRate: totals.revenue > 0 ? Math.round((totals.collected / totals.revenue) * 1000) / 10 : 0}};
}
