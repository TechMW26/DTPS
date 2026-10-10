import { randomBytes } from 'node:crypto';
import { type MongoDatabase, Timestamp } from '@/lib/db/mongo-types';

export function realtimeTargets(userId: string, role: string) {
  if (!/^[a-f0-9]{24}$/i.test(userId)) throw new Error('Invalid realtime user');
  const roles = ['admin', 'dietitian', 'health_counselor', 'client'];
  if (!roles.includes(role)) throw new Error('Invalid realtime role');
  return [`user:${userId}`, `role:${role}`, 'all'];
}
export async function publishNativeEvent(db: MongoDatabase, targets: string[], event: string, data: unknown) {
  if (!targets.length) return;
  if (targets.length > 100 || targets.some(target => !/^(all|user:[a-f0-9]{24}|role:(admin|dietitian|health_counselor|client))$/i.test(target))) throw new Error('Invalid event audience');
  if (!/^[a-zA-Z0-9_:-]{1,80}$/.test(event)) throw new Error('Invalid event type');
  // Normalize dates/undefined without placing Firebase credentials or transport objects in the log.
  const json = JSON.stringify(data ?? null);
  if (Buffer.byteLength(json) > 256_000) throw new Error('Realtime payload too large');
  const id = randomBytes(16).toString('hex');
  const now = Timestamp.now();
  await db.collection('_nativeRealtimeEvents').doc(id).create({
    targets: [...new Set(targets)], event, data: JSON.parse(json), createdAt: now,
    expiresAt: Timestamp.fromMillis(now.toMillis() + 5 * 60_000),
  });
  return id;
}
export async function nativeRealtimeActor(db: MongoDatabase, id: string) {
  if (!/^[a-f0-9]{24}$/i.test(id)) return null;
  const [user] = await db.getAll(db.collection('users').doc(id), {fieldMask:['role','status','isDeleted']});
  if (!user.exists || user.get('status') === 'inactive' || user.get('isDeleted')) return null;
  const role = String(user.get('role') || '');
  return ['admin','dietitian','health_counselor','client'].includes(role) ? { id, role } : null;
}
