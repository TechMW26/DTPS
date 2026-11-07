import type {MongoDatabase} from '@/lib/db/mongo-types';
import type {FCMNotificationPayload, SendNotificationResult} from '@/lib/firebase/firebaseNotification';
import {DIWALI_CAMPAIGN, DIWALI_PUSH_BODY, DIWALI_PUSH_IMAGE, DIWALI_PUSH_TITLE, isDiwaliPushTime} from './diwali';

const LOG = 'festive_push_log';
const MAX_ATTEMPTS = 3;
/** A send that started but never finished (crash/timeout) can be retried after this long. */
const STUCK_MS = 10 * 60 * 1000;
const BATCH = 10;

type Sender = (userId: string, notification: FCMNotificationPayload) => Promise<SendNotificationResult>;

function hasToken(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  return value.some((entry) => {
    const token = typeof entry === 'string' ? entry : (entry as {token?: unknown})?.token;
    return typeof token === 'string' && token.trim() !== '' && !['null', 'undefined', 'nan'].includes(token.trim().toLowerCase());
  });
}

function toMs(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (value && typeof value === 'object' && 'toDate' in value) return (value as {toDate: () => Date}).toDate().getTime();
  return 0;
}

function canRetry(log: {status?: unknown; attempts?: unknown; updatedAt?: unknown} | undefined, now: Date): boolean {
  if (!log) return true;
  const attempts = Number(log.attempts) || 0;
  if (attempts >= MAX_ATTEMPTS) return false;
  if (log.status === 'failed') return true;
  return log.status === 'sending' && now.getTime() - toMs(log.updatedAt) > STUCK_MS;
}

/**
 * Sends the Diwali push to every client with the app's notifications turned on, once each.
 * Safe to call every minute: a per-client log makes sure nobody gets it twice, and the work
 * stops before the time budget so the next run picks up the rest.
 */
export async function sendDiwaliGreetingBatch(db: MongoDatabase, send: Sender, options: {now?: Date; budgetMs?: number} = {}) {
  const now = options.now ?? new Date();
  if (!isDiwaliPushTime(now)) return {skipped: 'outside_window' as const};
  const budgetMs = options.budgetMs ?? 45_000;
  const started = Date.now();

  const clients = await db.collection('users').where('role', '==', 'client').select('fcmTokens').get();
  const reachable = clients.docs.filter((doc) => hasToken(doc.get('fcmTokens'))).map((doc) => doc.id);
  const logs = await db.collection(LOG).where('campaign', '==', DIWALI_CAMPAIGN).get();
  const byUser = new Map(logs.docs.map((doc) => [String(doc.get('userId')), doc.data()]));
  const todo = reachable.filter((id) => canRetry(byUser.get(id), now));

  const stats = {reachable: reachable.length, pending: todo.length, sent: 0, skipped: 0, failed: 0, notStarted: 0};
  for (let i = 0; i < todo.length; i += BATCH) {
    if (Date.now() - started > budgetMs) {
      stats.notStarted = todo.length - i;
      break;
    }
    await Promise.all(todo.slice(i, i + BATCH).map(async (userId) => {
      const ref = db.collection(LOG).doc(`${DIWALI_CAMPAIGN}_${userId}`);
      const claimed = await db.runTransaction(async (tx) => {
        const current = await tx.get(ref);
        if (current.exists && !canRetry(current.data(), new Date())) return false;
        const attempts = (current.exists ? Number(current.get('attempts')) || 0 : 0) + 1;
        tx.set(ref, {campaign: DIWALI_CAMPAIGN, userId, status: 'sending', attempts, updatedAt: new Date()});
        return true;
      });
      if (!claimed) return;
      let result: SendNotificationResult;
      try {
        result = await send(userId, {
          title: DIWALI_PUSH_TITLE,
          body: DIWALI_PUSH_BODY,
          image: DIWALI_PUSH_IMAGE,
          clickAction: '/user',
          data: {type: 'festive', url: '/user', campaign: DIWALI_CAMPAIGN},
        });
      } catch {
        result = {successCount: 0, failureCount: 1, invalidTokens: [], responses: []};
      }
      const status = result.successCount > 0 ? 'sent' : result.errorCode === 'NO_TOKEN' || result.errorCode === 'CLIENT_ON_HOLD' ? 'skipped' : 'failed';
      stats[status]++;
      await ref.set({status, successCount: result.successCount, errorCode: result.errorCode || null, updatedAt: new Date()}, {merge: true});
    }));
  }
  return stats;
}
