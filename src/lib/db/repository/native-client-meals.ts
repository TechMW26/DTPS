import type * as MongoTypes from '@/lib/db/mongo-types';
import { createHash } from 'node:crypto';
import { type MongoDatabase, type DocumentData } from '@/lib/db/mongo-types';
import { hydrateNativeDocument } from '@/lib/storage/native-document';
import { nativeJson } from './native-history';

const published = ['active','completed','paused'];
export async function nativePlanList(db: MongoDatabase, clientId: string) {
  const plans = await db.collection('clientmealplans').where('clientId','==',clientId)
    .where('status','in',published).select('name','status','startDate','endDate','duration','createdAt','isDeleted').get();
  return plans.docs.filter(doc=>!doc.get('isDeleted')).map(doc=>nativeJson({...doc.data(),_id:doc.id}) as DocumentData)
    .sort((a,b)=>new Date(b.createdAt||0).getTime()-new Date(a.createdAt||0).getTime());
}

export async function nativePlanForDate(db: MongoDatabase, clientId: string, start: Date, end: Date) {
  const plans = await db.collection('clientmealplans').where('clientId','==',clientId).where('status','in',published)
    .select('startDate','endDate','lastPublishedAt','createdAt','isDeleted').get();
  const date=(value:any)=>value?.toDate?.()||new Date(value||0);
  const matches=plans.docs.filter(doc=>!doc.get('isDeleted')&&date(doc.get('startDate'))<=end&&date(doc.get('endDate'))>=start)
    .sort((a,b)=>date(b.get('startDate')).getTime()-date(a.get('startDate')).getTime()||date(b.get('lastPublishedAt')).getTime()-date(a.get('lastPublishedAt')).getTime()||date(b.get('createdAt')).getTime()-date(a.get('createdAt')).getTime());
  for(const match of matches) {
    const fresh=await match.ref.get(),data=fresh.data();
    // Recheck after the second read: a deleted or rescheduled phase must not leak through.
    if(!data||data.isDeleted||data.clientId!==clientId||!published.includes(data.status)||date(data.startDate)>end||date(data.endDate)<start)continue;
    return nativeJson(await hydrateNativeDocument({...data,_id:fresh.id})) as DocumentData;
  }
  return null;
}

export async function nativeTemplateMeals(db: MongoDatabase, id: string) {
  if(!id||id.includes('/'))return null;
  const doc=await db.collection('diettemplates').doc(id).get();
  return doc.exists?nativeJson(await hydrateNativeDocument(doc.data()!)) as DocumentData:null;
}

export function recipeNameKey(name: string) {
  return createHash('sha256').update(name.trim().toLowerCase()).digest('hex');
}
const recipeFields=['name','uuid','ingredients','instructions','prepTime','cookTime','servings','difficulty','cuisine','tips','calories','protein','carbs','fat','image','images','video','equipment','storage','tags','dietaryRestrictions','allergens','isActive','_nativeExternalFields'];
export async function nativeMealRecipes(db: MongoDatabase, ids: string[], uuids: string[], names: string[]) {
  const records=new Map<string,DocumentData>();
  const add=(docs:MongoTypes.DocumentSnapshot[])=>docs.forEach(doc=>{if(doc.exists)records.set(doc.id,{...doc.data(),_id:doc.id});});
  const validIds=[...new Set(ids)].filter(id=>/^[a-f\d]{24}$/i.test(id));
  for(let i=0;i<validIds.length;i+=100)add(await db.getAll(...validIds.slice(i,i+100).map(id=>db.collection('recipes').doc(id)),{fieldMask:recipeFields}));
  for(const [field,values] of [['uuid',[...new Set(uuids)]],['name',[...new Set(names)]]] as const) {
    for(let i=0;i<values.length;i+=30) add((await db.collection('recipes').where(field,'in',values.slice(i,i+30)).select(...recipeFields).get()).docs);
  }
  // Imported recipes retain their original names; the side index supports legacy case-insensitive lookups.
  const keys=[...new Set(names.filter(Boolean).map(recipeNameKey))];
  for(let i=0;i<keys.length;i+=100) {
    const index=await db.getAll(...keys.slice(i,i+100).map(key=>db.collection('_nativeRecipeNames').doc(key)));
    const refs=[...new Set(index.flatMap(doc=>doc.get('recipeIds')||[]))].filter((id):id is string=>typeof id==='string'&&!id.includes('/'));
    for(let j=0;j<refs.length;j+=100)add(await db.getAll(...refs.slice(j,j+100).map(id=>db.collection('recipes').doc(id)),{fieldMask:recipeFields}));
  }
  const explicitIds=new Set(validIds),explicitUuids=new Set(uuids),normalizedNames=new Set(names.map(name=>name.trim().toLowerCase()));
  const hydrated=await Promise.all([...records.values()].map(row=>hydrateNativeDocument(row)));
  return hydrated.filter((row:any)=>explicitIds.has(row._id)||explicitUuids.has(row.uuid)||(normalizedNames.has(String(row.name||'').trim().toLowerCase())&&row.isActive!==false&&row.ingredients?.length&&row.instructions?.length))
    .map((row:any)=>{const {isActive,_nativeExternalFields,...data}=row;return nativeJson(data) as DocumentData;});
}
