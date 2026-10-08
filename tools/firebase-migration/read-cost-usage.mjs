// Read-only monitoring audit. Does not query application documents or log credentials.
// Usage: node tools/firebase-migration/read-cost-usage.mjs [--days=7]
import * as auth from 'firebase-tools/lib/auth.js';

const days = Number(process.argv.find(arg => arg.startsWith('--days='))?.slice(7) || 7);
if (!Number.isInteger(days) || days < 1 || days > 30) throw new Error('Use --days=1 through --days=30');
const account = auth.getGlobalDefaultAccount();
if (!account?.tokens?.refresh_token) throw new Error('Sign in with firebase login before this read-only audit');
const token = await auth.getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform']);
const end = new Date(), start = new Date(end.getTime() - days * 86400000);
const series = [];
let next = '';
do {
  const url = new URL('https://monitoring.googleapis.com/v3/projects/dtps-2cbac/timeSeries');
  for (const [key, value] of Object.entries({
    filter: 'metric.type="firestore.googleapis.com/api/billable_read_units"',
    'interval.startTime': start.toISOString(), 'interval.endTime': end.toISOString(),
    'aggregation.alignmentPeriod': '86400s', 'aggregation.perSeriesAligner': 'ALIGN_SUM',
    pageSize: '1000', ...(next ? {pageToken: next} : {}),
  })) url.searchParams.set(key, value);
  const response = await fetch(url, {headers: {Authorization: `Bearer ${token.access_token}`}});
  const data = await response.json();
  if (!response.ok) throw new Error(`Monitoring ${response.status}: ${data.error?.message || 'request failed'}`);
  series.push(...data.timeSeries || []);
  next = data.nextPageToken || '';
} while (next);

// This database emits identical Query and RunQuery time series. Do not sum
// these aliases into a misleading double-sized cost estimate.
const hasRunQuery = new Set(series.filter(s => s.metric.labels.api_method === 'RunQuery').map(s => s.resource.labels.database_id));
const rows = series.filter(s => !(s.metric.labels.api_method === 'Query' && hasRunQuery.has(s.resource.labels.database_id))).map(s => ({
  database: s.resource.labels.database_id,
  method: s.metric.labels.api_method,
  readUnits: s.points.reduce((sum, p) => sum + Number(p.value.int64Value || p.value.doubleValue || 0), 0),
  windows: s.points.map(p => ({start: p.interval.startTime, end: p.interval.endTime, readUnits: Number(p.value.int64Value || p.value.doubleValue || 0)})),
})).sort((a, b) => b.readUnits - a.readUnits);
console.log(JSON.stringify({
  start: start.toISOString(), end: end.toISOString(), rows,
  note: 'Monitoring usage is delayed and is not an invoice. Windows are UTC rolling alignment buckets, not India calendar days. Query alias omitted when RunQuery exists. Do not count billing-disabled outage hours as optimization savings.',
  budget: {monthlyINR: 25000, averageDailyINR31Days: 25000 / 31, note: 'Budget target, not an enforced spending cap. Leave headroom for tax, transfer, writes and other hosting costs.'},
}, null, 2));
