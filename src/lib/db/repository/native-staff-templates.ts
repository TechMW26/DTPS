import type * as MongoTypes from '@/lib/db/mongo-types';
import {randomBytes} from 'node:crypto';
import type {MongoDatabase,DocumentData,Query} from '@/lib/db/mongo-types';
import {hydrateNativeDocument,prepareNativeDocument,prepareNativePatch} from '@/lib/storage/native-document';
import {nativeJson} from './native-history';
import {dietTemplateSchema,sanitizeDietTemplatePayload} from './native-template-schema';
import {NativeStaffClientError} from './native-staff-client';
export type NativeTemplateCollection='diettemplates'|'mealplantemplates';
type Actor={id:string;role:string}|null;
const summaries=new WeakMap<MongoDatabase,Map<string,{expires:number;pending:Promise<MongoTypes.QuerySnapshot>}>>();
// Enrichment belongs to the same short-lived metadata snapshot. Authorization is
// still checked on every request and mutations discard that snapshot immediately.
const summaryViews=new WeakMap<MongoTypes.QuerySnapshot,Map<string,Promise<DocumentData[]>>>();
const metadata='name description category difficulty dietaryRestrictions tags createdBy createdAt averageRating usageCount targetAudience isPublic isActive templateType duration targetCalories totalRecipes averageDailyCalories uuid'.split(' ');
async function actorView(db:MongoDatabase,actor:Actor){if(!actor)return null;const user=await db.collection('users').doc(actor.id).get();if(!user.exists||['inactive','suspended'].includes(user.get('status'))||user.get('isActive')===false)throw new NativeStaffClientError('Unauthorized',401);return {id:actor.id,role:user.get('role')};}
const staff=(actor:Actor)=>!!actor&&['admin','dietitian','health_counselor'].includes(actor.role);
async function views(db:MongoDatabase,rows:MongoTypes.DocumentSnapshot[],recipes=false,summary=false){
 const data=await Promise.all(rows.map(async row=>{const hydrated=summary?{...row.data()}:await hydrateNativeDocument(row.data()!);delete hydrated._nativeExternalFields;delete hydrated._nativeSource;return {...hydrated,_id:row.id} as DocumentData;}));
 const ids=[...new Set(data.map(t=>t.createdBy).filter(id=>typeof id==='string'&&/^[a-f0-9]{24}$/.test(id)))];const names=new Map<string,DocumentData>();
 for(let i=0;i<ids.length;i+=100){const users=await db.getAll(...ids.slice(i,i+100).map(id=>db.collection('users').doc(id)),{fieldMask:['firstName','lastName','role']});for(const u of users)if(u.exists)names.set(u.id,{...u.data(),_id:u.id});}
 for(const t of data){t.createdBy=names.get(t.createdBy)||{_id:typeof t.createdBy==='string'?t.createdBy:'unassigned',firstName:'Unassigned',lastName:'',role:'unknown'};if(summary)continue;let total=0,days=0,count=0;for(const day of t.meals||[]){let calories=0;for(const meal of Object.values(day.meals||{}) as any[]){const options=Array.isArray(meal?.foodOptions)?meal.foodOptions:[];count+=options.length;for(const food of options)if(food?.isAlternative!==true&&!/alternative/i.test(String(food?.label||'')))calories+=parseFloat(food.cal)||0;}if(calories>0){total+=calories;days++;}}t.averageDailyCalories=days?Math.round(total/days):0;t.totalRecipes=count;}
 if(recipes){const recipeIds=new Set<string>();function collect(value:any){if(Array.isArray(value))value.forEach(collect);else if(value&&typeof value==='object')for(const [key,item] of Object.entries(value)){if(key==='recipeId'&&typeof item==='string'&&/^[a-f0-9]{24}$/.test(item))recipeIds.add(item);else collect(item);}}data.forEach(t=>collect(t.meals));const all=[...recipeIds],map=new Map<string,DocumentData>();for(let i=0;i<all.length;i+=100){const rows=await db.getAll(...all.slice(i,i+100).map(id=>db.collection('recipes').doc(id)),{fieldMask:['name','description','nutrition','image','category']});for(const r of rows)if(r.exists)map.set(r.id,{...r.data(),_id:r.id});}function replace(value:any){if(Array.isArray(value))value.forEach(replace);else if(value&&typeof value==='object')for(const [key,item] of Object.entries(value)){if(key==='recipeId'&&typeof item==='string'&&map.has(item))value[key]=map.get(item);else replace(item);}}data.forEach(t=>replace(t.meals));}
 return nativeJson(data) as DocumentData[];
}
export async function listStaffTemplates(db:MongoDatabase,collection:NativeTemplateCollection,session:Actor,params:URLSearchParams){
 const actor=await actorView(db,session);let query:Query=db.collection(collection);
 if(!(actor?.role==='admin'&&params.get('includeInactive')==='true'))query=query.where('isActive','==',true);
 if(!staff(actor))query=query.where('isPublic','==',true);else if(params.has('isPublic'))query=query.where('isPublic','==',params.get('isPublic')==='true');
 const creator=params.get('createdBy');if(creator&&!['undefined','null'].includes(creator))query=query.where('createdBy','==',creator);else if(actor?.role==='dietitian'&&collection==='diettemplates')query=query.where('createdBy','==',actor.id);
 for(const key of ['category','difficulty','templateType']){const value=params.get(key);if(value&&value!=='all'&&(key!=='templateType'||collection==='mealplantemplates')&&!(key==='templateType'&&value==='plan'))query=query.where(key,'==',value);}
 const search=params.get('search')?.trim().toLowerCase(),restrictions=params.get('dietaryRestrictions')?.split(',').filter(Boolean)||[],goal=params.get('primaryGoal');
 // Search only small metadata projections. Hydrate large meal bodies for the requested page.
 let candidates:MongoTypes.QuerySnapshot;
 if(params.get('summary')==='true'){
  let cache=summaries.get(db);if(!cache){cache=new Map();summaries.set(db,cache);}const key=JSON.stringify([collection,actor?.id,actor?.role,...['createdBy','includeInactive','isPublic','category','difficulty','templateType'].map(k=>params.get(k))]);let entry=cache.get(key);
  if(!entry||entry.expires<Date.now()){if(cache.size>=100)cache.delete(cache.keys().next().value!);const pending=query.select(...metadata).get();entry={expires:Infinity,pending};cache.set(key,entry);const current=entry;pending.then(()=>{current.expires=Date.now()+30000;},()=>{if(cache!.get(key)===current)cache!.delete(key);});}candidates=await entry.pending;
 }else candidates=await query.select(...metadata).get();let filtered=candidates.docs.filter(row=>{const d=row.data();return (collection!=='mealplantemplates'||params.get('templateType')!=='plan'||d.templateType===undefined||d.templateType==='plan')&&(!search||[d.name,d.description,...(d.tags||[])].some(v=>String(v||'').toLowerCase().includes(search)))&&restrictions.every(r=>(d.dietaryRestrictions||[]).includes(r))&&(!goal||goal==='all'||d.category===goal||(d.targetAudience?.goals||[]).includes(goal));});
 const sort=params.get('sortBy')||'newest',key=sort==='name'?'name':sort==='rating'?'averageRating':sort==='popular'?'usageCount':'createdAt';filtered.sort((a,b)=>{const av=a.get(key),bv=b.get(key);return key==='name'?String(av||'').localeCompare(String(bv||'')):(bv?.toMillis?.()??bv??0)-(av?.toMillis?.()??av??0)||a.id.localeCompare(b.id);});
 const number=(s:string|null,fallback:number)=>{const n=Number(s);return s&&Number.isFinite(n)?Math.floor(n):fallback;},limit=Math.max(1,Math.min(params.get('summary')==='true'?10000:1000,number(params.get('limit'),10))),skip=Math.max(0,number(params.get('skip'),(Math.max(1,number(params.get('page'),1))-1)*limit));
 const summary=params.get('summary')==='true',selected=filtered.slice(skip,skip+limit),rows=summary?selected:selected.length?await db.getAll(...selected.map(r=>r.ref)):[];
 let templates:DocumentData[];
 if(summary){
  let cache=summaryViews.get(candidates);if(!cache){cache=new Map();summaryViews.set(candidates,cache);}
  const selection=rows.map(row=>row.id).join(',');let pending=cache.get(selection);
  if(!pending){if(cache.size>=10)cache.delete(cache.keys().next().value!);pending=views(db,rows,false,true);cache.set(selection,pending);const current=pending;pending.catch(()=>{if(cache!.get(selection)===current)cache!.delete(selection);});}
  templates=structuredClone(await pending);
 }else templates=await views(db,rows);
 return {success:true,templates,total:filtered.length,categories:[...new Set(candidates.docs.map(d=>d.get('category')).filter(Boolean))],page:Math.floor(skip/limit)+1,totalPages:Math.ceil(filtered.length/limit)};
}
export async function readStaffTemplate(db:MongoDatabase,collection:NativeTemplateCollection,id:string,session:Actor){
 if(!/^[a-f0-9]{24}$/.test(id))throw new NativeStaffClientError('Invalid template ID');const actor=await actorView(db,session),doc=await db.collection(collection).doc(id).get();if(!doc.exists||doc.get('isActive')===false||(!staff(actor)&&doc.get('isPublic')!==true))throw new NativeStaffClientError('Template not found',404);return (await views(db,[doc],collection==='diettemplates'))[0];
}
export async function mutateStaffTemplate(db:MongoDatabase,collection:NativeTemplateCollection,actorId:string,input:unknown,id?:string,operation:'save'|'delete'|'restore'='save',mealsOnly=false){
 if(id&&!/^[a-f0-9]{24}$/.test(id))throw new NativeStaffClientError('Invalid template ID');
 let patch:DocumentData={};if(operation==='save'){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new NativeStaffClientError('Invalid template');const raw=input as DocumentData;
  patch=id?dietTemplateSchema.partial().parse(raw):dietTemplateSchema.parse(sanitizeDietTemplatePayload(raw));
  if(id)for(const key of Object.keys(patch))if(raw[key]===undefined)delete patch[key];
  if(collection==='mealplantemplates'&&raw.templateType!==undefined){if(!['plan','diet'].includes(raw.templateType))throw new NativeStaffClientError('Invalid template type');patch.templateType=raw.templateType;}
  if(JSON.stringify(patch).length>16*1024*1024)throw new NativeStaffClientError('Template is too large');
 }
 const ref=db.collection(collection).doc(id||randomBytes(12).toString('hex'));
 await db.runTransaction(async tx=>{
  const [actor,current]=await tx.getAll(db.collection('users').doc(actorId),ref);
  if(!actor.exists||['inactive','suspended'].includes(actor.get('status'))||actor.get('isActive')===false||!['admin','dietitian'].includes(actor.get('role')))throw new NativeStaffClientError('Insufficient permissions',403);
  if(id&&!current.exists)throw new NativeStaffClientError('Template not found',404);
  if(operation==='restore'&&actor.get('role')!=='admin')throw new NativeStaffClientError('Admin access required',403);
  const editMeals=mealsOnly&&operation==='save'&&Object.keys(patch).every(k=>['meals','mealTypes'].includes(k));
  if(current.exists&&actor.get('role')!=='admin'&&current.get('createdBy')!==actorId&&!editMeals)throw new NativeStaffClientError('Only the creator or admin can change this template',403);
  let counter:MongoTypes.DocumentReference|undefined,seq:number|undefined;if(!current.exists){counter=db.collection('_nativeCounters').doc(collection==='diettemplates'?'dietTemplateIds':'mealPlanTemplateIds');const row=await tx.get(counter);seq=row.get('seq');if(!Number.isSafeInteger(seq)||seq!<0)throw new NativeStaffClientError('Template counter requires reconciliation',503);seq=seq!+1;}
  const now=new Date();if(operation!=='save')patch={isActive:operation==='restore'};
  if(current.exists)tx.update(ref,await prepareNativePatch(current.data()!,{...patch,updatedAt:now}));else {tx.update(counter!,{seq});tx.create(ref,await prepareNativeDocument({...patch,uuid:String(seq),_id:ref.id,createdBy:actorId,isActive:true,usageCount:0,averageRating:0,...(collection==='mealplantemplates'?{templateType:patch.templateType||'plan'}:{}),createdAt:now,updatedAt:now}));}
  const auditId=randomBytes(12).toString('hex');tx.create(db.collection('activitylogs').doc(auditId),{_id:auditId,userId:actorId,userRole:actor.get('role'),action:`${operation} template`,actionType:operation==='delete'?'delete':id?'update':'create',category:'diet_plan',description:`${collection}/${ref.id}`,createdAt:now,updatedAt:now});
 });
 summaries.delete(db);
 return (await views(db,[await ref.get()]))[0];
}
