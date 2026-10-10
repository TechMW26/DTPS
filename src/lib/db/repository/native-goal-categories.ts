import {createHash, randomBytes} from 'node:crypto';
import type {MongoDatabase, DocumentData} from '@/lib/db/mongo-types';
import {z} from 'zod';
import {nativeDates} from './native-plan-editor';

const schema = z.object({
  name: z.string().trim().min(1).max(100),
  value: z.string().trim().min(1).max(100).transform(value => value.toLowerCase().replace(/\s+/g, '-')),
  description: z.string().trim().max(500).default(''),
  icon: z.string().trim().min(1).max(100).default('target'),
  isActive: z.boolean().default(true),
  order: z.number().finite().default(0),
});
export class NativeGoalCategoryError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
function categoryRef(db: MongoDatabase, id: string) {
  if (!/^[a-f\d]{24}$/i.test(id)) throw new NativeGoalCategoryError('Invalid goal category ID', 400);
  return db.collection('goalcategories').doc(id);
}
function identity(db: MongoDatabase, tag: DocumentData) {
  return db.collection('_nativeGoalValues').doc(createHash('sha256').update(tag.value).digest('hex'));
}
function view(id: string, raw: DocumentData) {
  const data = nativeDates(raw);
  return {_id:id,name:data.name,value:data.value,description:data.description||'',icon:data.icon||'target',isActive:data.isActive,order:data.order||0,createdAt:data.createdAt,updatedAt:data.updatedAt};
}
export async function listNativeGoalCategories(db: MongoDatabase, activeOnly: boolean) {
  const collection=db.collection('goalcategories');
  const rows=await (activeOnly?collection.where('isActive','==',true):collection).get();
  return rows.docs.map(row=>view(row.id,row.data())).sort((a,b)=>a.order-b.order||a.name.localeCompare(b.name));
}
export async function getNativeGoalCategory(db: MongoDatabase, id: string) {
  const row = await categoryRef(db,id).get();
  if (!row.exists) throw new NativeGoalCategoryError('Goal category not found',404);
  return view(row.id,row.data()!);
}
export async function saveNativeGoalCategory(db: MongoDatabase, actor: string, input: unknown, id?: string) {
  const parsed = (id ? schema.partial() : schema).safeParse(input);
  if (!parsed.success) throw new NativeGoalCategoryError('Invalid goal category fields',400);
  if (id) for (const key of Object.keys(parsed.data)) if (!Object.prototype.hasOwnProperty.call(input,key)) delete (parsed.data as Record<string,unknown>)[key];
  const ref = categoryRef(db,id || randomBytes(12).toString('hex'));
  return db.runTransaction(async tx => {
    const current = await tx.get(ref);
    if (id && !current.exists) throw new NativeGoalCategoryError('Goal category not found',404);
    const data = {...current.data(),...parsed.data};
    const claim = identity(db,data), claimed = await tx.get(claim);
    const duplicates = await tx.get(db.collection('goalcategories').where('value','==',data.value).limit(2));
    if ((claimed.exists && claimed.get('categoryId') !== ref.id) || duplicates.docs.some(row => row.id !== ref.id)) throw new NativeGoalCategoryError('Goal category value already exists',409);
    const previous = current.exists ? identity(db,current.data()!) : null;
    const oldClaim = previous && previous.path !== claim.path ? await tx.get(previous) : null;
    const now = new Date(), patch = {...parsed.data,updatedAt:now};
    if (current.exists) tx.update(ref,patch);
    else tx.create(ref,{...patch,_id:ref.id,createdBy:actor,createdAt:now});
    if (oldClaim?.get('categoryId') === ref.id) tx.delete(oldClaim.ref);
    tx.set(claim,{categoryId:ref.id});
    return view(ref.id,{...data,...patch,createdBy:current.get('createdBy') || actor,createdAt:current.get('createdAt') || now});
  });
}
export async function deleteNativeGoalCategory(db: MongoDatabase, id: string) {
  const ref = categoryRef(db,id);
  await db.runTransaction(async tx => {
    const row = await tx.get(ref);
    if (!row.exists) throw new NativeGoalCategoryError('Goal category not found',404);
    const claim = await tx.get(identity(db,row.data()!));
    tx.delete(ref);
    if (claim.get('categoryId') === id) tx.delete(claim.ref);
  });
}
