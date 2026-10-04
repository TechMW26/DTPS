import { randomBytes } from 'node:crypto';
import { Timestamp, type Firestore, type DocumentData } from 'firebase-admin/firestore';

/** Preserve date/binary values while removing optional undefined fields rejected by Firestore. */
function clean(value: unknown): unknown {
  if (value === undefined) return null;
  if (value === null || value instanceof Date || value instanceof Timestamp || Buffer.isBuffer(value)) return value;
  if (Array.isArray(value)) return value.map(clean);
  if (typeof value === 'object') {
    if (Object.getPrototypeOf(value) !== Object.prototype) throw new Error('Audit values must be plain data');
    return Object.fromEntries(Object.entries(value).filter(([,v]) => v !== undefined).map(([k,v]) => [k,clean(v)]));
  }
  return value;
}

export async function createNativeAudit<T = DocumentData>(
  db: Firestore, collection: 'activitylogs' | 'systemalerts' | 'histories' | 'notificationdeliveryaudits', entry: DocumentData,
): Promise<T> {
  const id = randomBytes(12).toString('hex'), now = new Date();
  const record = { ...(clean(entry) as DocumentData), _id: id, createdAt: now, updatedAt: now };
  await db.collection(collection).doc(id).create(record);
  return record as T;
}
