import type * as MongoTypes from '@/lib/db/mongo-types';
import { type MongoDatabase, type Query } from '@/lib/db/mongo-types';
import { nativeDates } from './native-plan-editor';

export const notificationRoles = ['admin', 'dietitian', 'health_counselor', 'client'];
export const notificationActions = ['assigned', 'message', 'meal', 'update', 'custom'];
type Counts = { total: number; sent: number; deduped: number; failed: number };
const counts = (): Counts => ({ total: 0, sent: 0, deduped: 0, failed: 0 });
const add = (target: Counts, status: string) => {
  target.total++;
  if (status === 'sent' || status === 'deduped' || status === 'failed') target[status]++;
};
export async function nativeNotificationMetrics(db: MongoDatabase, options: {
  days?: number; role?: string; actionType?: string; now?: Date;
}) {
  const days = Math.trunc(Math.min(90, Math.max(1, Number.isFinite(options.days) ? options.days! : 7)));
  const to = options.now || new Date();
  const ist = new Date(to.getTime() + 330 * 60_000);
  const from = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() - days + 1) - 330 * 60_000);
  const role = notificationRoles.includes(options.role || '') ? options.role! : null;
  const actionType = notificationActions.includes(options.actionType || '') ? options.actionType! : null;
  let query: Query = db.collection('notificationdeliveryaudits').where('createdAt', '>=', from).where('createdAt', '<=', to);
  if (role) query = query.where('recipientRole', '==', role);
  if (actionType) query = query.where('actionType', '==', actionType);
  const totals = counts();
  const actions = new Map<string, Counts>(), roles = new Map<string, Counts>(), dates = new Map<string, Counts>();
  const recentFailures: Record<string, unknown>[] = [];
  let cursor: MongoTypes.QueryDocumentSnapshot | undefined;
  // Iterate a projected stream in bounded pages instead of loading audit payloads into memory.
  for (;;) {
    let page = query.orderBy('createdAt', 'desc').limit(500)
      .select('status', 'recipientRole', 'actionType', 'createdAt', 'title', 'clientName', 'error');
    if (cursor) page = page.startAfter(cursor);
    const rows = await page.get();
    for (const doc of rows.docs) {
      const item = nativeDates(doc.data());
      add(totals, item.status);
      const date = new Date(item.createdAt.getTime() + 330 * 60_000).toISOString().slice(0, 10);
      for (const [map, key] of [[actions, item.actionType || 'custom'], [roles, item.recipientRole || 'unknown'], [dates, date]] as const) {
        if (!map.has(key)) map.set(key, counts());
        add(map.get(key)!, item.status);
      }
      if (item.status === 'failed' && recentFailures.length < 20) recentFailures.push({ ...item, _id: doc.id });
    }
    if (rows.size < 500) break;
    cursor = rows.docs[rows.docs.length - 1];
  }
  return {
    success: true, window: { from: from.toISOString(), to: to.toISOString(), days }, filters: { role, actionType }, totals,
    rates: { failureRate: totals.total ? Number((totals.failed / totals.total * 100).toFixed(2)) : 0,
      dedupeRate: totals.total ? Number((totals.deduped / totals.total * 100).toFixed(2)) : 0 },
    breakdown: {
      byAction: [...actions].map(([actionType, value]) => ({ actionType, ...value })).sort((a,b) => b.total-a.total),
      byRole: [...roles].map(([recipientRole, value]) => ({ recipientRole, ...value })).sort((a,b) => b.total-a.total),
    },
    timeline: [...dates].sort(([a],[b]) => a.localeCompare(b)).map(([date, value]) => ({ date, ...value })),
    recentFailures, generatedAt: to.toISOString(),
  };
}
