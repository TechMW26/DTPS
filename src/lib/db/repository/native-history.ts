import { Timestamp, type MongoDatabase, type DocumentData } from '@/lib/db/mongo-types';

export function nativeJson(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(nativeJson);
  if (value && typeof value === 'object' && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) {
    return Object.fromEntries(Object.entries(value).map(([key,item]) => [key,nativeJson(item)]));
  }
  return value;
}

export async function nativeHistoryAccess(db: MongoDatabase, targetId: string, actor: {id: string; role: string}) {
  const target = await db.collection('users').doc(targetId).get();
  if (!target.exists) return {status:404 as const};
  const data = target.data()!;
  const assigned = actor.role === 'dietitian' &&
    (data.assignedDietitian === actor.id || data.assignedDietitians?.includes(actor.id));
  return {status: actor.role === 'admin' || actor.id === targetId || assigned ? 200 as const : 403 as const};
}

export async function nativeHistoryPage(db: MongoDatabase, userId: string, page: number, limit: number, category?: string | null) {
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100 || (page-1)*limit>100000) {
    throw new Error('Invalid pagination');
  }
  let query = db.collection('histories').where('userId','==',userId);
  if (category) query = query.where('category','==',category);
  const [rows,count] = await Promise.all([
    query.orderBy('createdAt','desc').offset((page-1)*limit).limit(limit).get(), query.count().get(),
  ]);
  return {history:rows.docs.map(doc=>({...doc.data(),_id:doc.id}) as DocumentData),total:count.data().count};
}
