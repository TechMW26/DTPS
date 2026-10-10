import type * as MongoTypes from '@/lib/db/mongo-types';
import {createHash, randomBytes} from 'node:crypto';
import type {MongoDatabase, DocumentData} from '@/lib/db/mongo-types';
import {z} from 'zod';
import {nativeDates} from './native-plan-editor';

const schema = z.object({
  name: z.string().trim().min(1).max(50),
  description: z.string().trim().max(200).default(''),
  color: z.string().regex(/^#([a-f\d]{6}|[a-f\d]{3})$/i).default('#3B82F6'),
  icon: z.string().trim().min(1).max(100).default('tag'),
  tagType: z.enum(['dietitian', 'health_counselor', 'general']).default('general'),
});
export class NativeTagError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
function tagRef(db: MongoDatabase, id: string) {
  if (!/^[a-f\d]{24}$/i.test(id)) throw new NativeTagError('Invalid tag ID', 400);
  return db.collection('tags').doc(id);
}
function identity(db: MongoDatabase, tag: DocumentData) {
  return db.collection('_nativeTagNames').doc(createHash('sha256').update(tag.tagType + '\0' + tag.name).digest('hex'));
}
function view(id: string, raw: DocumentData) {
  const data = nativeDates(raw);
  return {_id: id, name: data.name, description: data.description || '', color: data.color || '#3B82F6', icon: data.icon || 'tag', tagType: data.tagType || 'general', createdBy: data.createdBy, createdAt: data.createdAt, updatedAt: data.updatedAt};
}
export async function listNativeTags(db: MongoDatabase, role: string, type: string | null) {
  let query: MongoTypes.Query = db.collection('tags');
  if (type && ['dietitian','health_counselor','general'].includes(type)) query = query.where('tagType', '==', type);
  else if (role !== 'admin') query = query.where('tagType', 'in', [role, 'general']);
  const rows = await query.get();
  return rows.docs.map(row => view(row.id, row.data())).sort((a,b) => a.tagType.localeCompare(b.tagType) || a.name.localeCompare(b.name));
}
export async function getNativeTag(db: MongoDatabase, id: string) {
  const row = await tagRef(db,id).get();
  if (!row.exists) throw new NativeTagError('Tag not found',404);
  return view(row.id,row.data()!);
}
export async function saveNativeTag(db: MongoDatabase, actor: string, input: unknown, id?: string) {
  const parsed = (id ? schema.partial() : schema).safeParse(input);
  if (!parsed.success) throw new NativeTagError('Invalid tag fields',400);
  if (id) for (const key of Object.keys(parsed.data)) if (!Object.prototype.hasOwnProperty.call(input,key)) delete (parsed.data as Record<string,unknown>)[key];
  const ref = tagRef(db,id || randomBytes(12).toString('hex'));
  return db.runTransaction(async tx => {
    const admin=await tx.get(db.collection('users').doc(actor));if(admin.get('role')!=='admin'||admin.get('status')!=='active')throw new NativeTagError('Admin access required',403);
    const current = await tx.get(ref);
    if (id && !current.exists) throw new NativeTagError('Tag not found',404);
    const data = {...current.data(),...parsed.data};
    const claim = identity(db,data), claimed = await tx.get(claim);
    const duplicates = await tx.get(db.collection('tags').where('name','==',data.name).where('tagType','==',data.tagType).limit(2));
    if ((claimed.exists && claimed.get('tagId') !== ref.id) || duplicates.docs.some(row => row.id !== ref.id)) throw new NativeTagError('Tag name already exists for this type',409);
    const previous = current.exists ? identity(db,current.data()!) : null;
    const oldClaim = previous && previous.path !== claim.path ? await tx.get(previous) : null;
    const now = new Date(), patch = {...parsed.data,updatedAt:now};
    if (current.exists) tx.update(ref,patch);
    else tx.create(ref,{...patch,_id:ref.id,createdBy:actor,createdAt:now});
    if (oldClaim?.get('tagId') === ref.id) tx.delete(oldClaim.ref);
    tx.set(claim,{tagId:ref.id});
    return view(ref.id,{...data,...patch,createdBy:current.get('createdBy') || actor,createdAt:current.get('createdAt') || now});
  });
}
export async function deleteNativeTag(db: MongoDatabase, id: string, actor: string) {
  const ref = tagRef(db,id);
  await db.runTransaction(async tx => {
    const admin=await tx.get(db.collection('users').doc(actor));if(admin.get('role')!=='admin'||admin.get('status')!=='active')throw new NativeTagError('Admin access required',403);
    const row = await tx.get(ref);
    if (!row.exists) throw new NativeTagError('Tag not found',404);
    const claim = await tx.get(identity(db,row.data()!));
    tx.delete(ref);
    if (claim.get('tagId') === id) tx.delete(claim.ref);
  });
}
