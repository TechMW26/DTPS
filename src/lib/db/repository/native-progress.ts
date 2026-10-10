import type * as MongoTypes from '@/lib/db/mongo-types';
import {createHash,randomBytes} from 'node:crypto';
import type {MongoDatabase,DocumentData} from '@/lib/db/mongo-types';
import {z} from 'zod';
import {nativeDates} from './native-plan-editor';
import {nativeHabitDay} from './native-habits';
import {hydrateNativeDocument,prepareNativeDocument,prepareNativePatch} from '@/lib/storage/native-document';
export class NativeProgressError extends Error{constructor(message:string,public status:number){super(message);}}
const measurements=['waist','abdomen','hips','chest','arms','thighs'] as const;
const numeric=z.coerce.number().finite().positive().max(1000);
const schema=z.object({type:z.enum(['weight','body_fat','muscle_mass','waist','chest','hips','arms','thighs','abdomen','height','photo','measurements']).default('weight'),value:numeric.optional(),measurements:z.object(Object.fromEntries(measurements.map(key=>[key,z.coerce.number().finite().min(0).max(1000).optional()]))).optional(),notes:z.string().max(1000).default(''),photoUrl:z.string().max(4000).optional(),side:z.enum(['front','back','left','right','side']).default('front')});
export async function nativeProgressHistory(db:MongoDatabase,userId:string,start:Date,allWeights:boolean){
 const hydrate=async(rows:MongoTypes.QuerySnapshot)=>Promise.all(rows.docs.filter(row=>!row.get('deletedAt')&&!row.get('isDeleted')).map(async row=>({...nativeDates(await hydrateNativeDocument(row.data())),_id:row.id})));
 const [user,entries,weights,food,plans]=await Promise.all([
  db.collection('users').doc(userId).get(),
  db.collection('progressentries').where('user','==',userId).where('recordedAt','>=',start).orderBy('recordedAt','desc').get(),
  allWeights?db.collection('progressentries').where('user','==',userId).where('type','==','weight').orderBy('recordedAt','desc').get():null,
  db.collection('foodlogs').where('client','==',userId).where('date','>=',start).orderBy('date','desc').get(),
  db.collection('clientmealplans').where('clientId','==',userId).where('status','in',['active','paused','completed']).where('endDate','>=',start).get(),
 ]);
 const relevantMealPlans=await hydrate(plans);relevantMealPlans.sort((a,b)=>new Date(b.startDate).getTime()-new Date(a.startDate).getTime()||new Date(b.lastPublishedAt||b.createdAt).getTime()-new Date(a.lastPublishedAt||a.createdAt).getTime());
 return {user:user.exists?nativeDates(user.data()!):null,allProgressEntries:await hydrate(entries),allWeightEntriesRaw:weights?await hydrate(weights):null,foodLogs:await hydrate(food),relevantMealPlans};
}
export async function saveNativeProgress(db:MongoDatabase,userId:string,input:unknown,key?:string|null){
 const parsed=schema.safeParse(input);if(!parsed.success)throw new NativeProgressError('Invalid progress details',400);const data=parsed.data;
 const values:DocumentData[]=data.type==='measurements'?measurements.filter(type=>Number(data.measurements?.[type])>0).map(type=>({type,value:Number(data.measurements![type]),unit:'cm'})):data.type==='photo'?data.photoUrl&&(/^https:\/\//.test(data.photoUrl)||/^\/api\/(files|media)\//.test(data.photoUrl))?[{type:'photo',value:data.photoUrl,unit:data.side}]:[]:data.value?[{type:data.type,value:data.value,unit:data.type==='weight'||data.type==='muscle_mass'?'kg':data.type==='body_fat'?'%':'cm'}]:[];
 if(!values.length)throw new NativeProgressError('Progress values are required',400);
 const operation=key&&/^[a-zA-Z0-9._:-]{8,128}$/.test(key)?key:randomBytes(16).toString('hex'),opId=createHash('sha256').update(userId+'\0'+operation).digest('hex'),fingerprint=createHash('sha256').update(JSON.stringify(data)).digest('hex'),now=new Date(),day=nativeHabitDay(null);
 const entries=values.map((value,index)=>({...value,_id:createHash('sha256').update(opId+'\0'+index).digest('hex').slice(0,24),user:userId,notes:data.notes,recordedAt:now,createdAt:now,updatedAt:now}));
 return db.runTransaction(async tx=>{
  const op=db.collection('_nativeProgressOperations').doc(opId),existing=await tx.get(op);
  if(existing.exists){if(existing.get('fingerprint')!==fingerprint)throw new NativeProgressError('Progress retry conflict',409);const rows=await tx.getAll(...existing.get('entryIds').map((id:string)=>db.collection('progressentries').doc(id)));if(rows.some(row=>!row.exists||row.get('deletedAt')))throw new NativeProgressError('Progress entry was deleted',409);return {created:false,entries:rows.map(row=>nativeDates(row.data()!))};}
  let journal:MongoTypes.QueryDocumentSnapshot|undefined,patch:DocumentData|undefined,ref:MongoTypes.DocumentReference|undefined;
  if(data.type==='measurements'){
   const rows=await tx.get(db.collection('journaltrackings').where('client','==',userId).where('date','>=',day.start).where('date','<',day.end).limit(2));if(rows.size>1)throw new NativeProgressError('Duplicate journals require reconciliation',409);
   journal=rows.docs[0];ref=journal?.ref||db.collection('journaltrackings').doc(createHash('sha256').update(userId+'\0'+day.key).digest('hex').slice(0,24));
   if(!journal&&(await tx.get(ref)).exists)throw new NativeProgressError('Journal identity conflict',409);
   const current=journal?await hydrateNativeDocument(journal.data()):{};
   const measurement={arm:Number(data.measurements?.arms||0),waist:Number(data.measurements?.waist||0),abd:Number(data.measurements?.abdomen||0),chest:Number(data.measurements?.chest||0),hips:Number(data.measurements?.hips||0),thigh:Number(data.measurements?.thighs||0),date:now,createdAt:now};
   patch={measurements:[...(current.measurements||[]),measurement],updatedAt:now};
   patch=journal?await prepareNativePatch(journal.data(),patch):await prepareNativeDocument({_id:ref.id,client:userId,date:day.start,createdAt:now,water:[],steps:[],sleep:[],activities:[],...patch});
  }
  tx.create(op,{userId,fingerprint,entryIds:entries.map(entry=>entry._id),createdAt:now});
  for(const entry of entries)tx.create(db.collection('progressentries').doc(entry._id),entry);
  if(ref&&patch){if(journal)tx.update(ref,patch);else tx.create(ref,patch);}
  return {created:true,entries};
 });
}
export async function deleteNativeProgress(db:MongoDatabase,userId:string,id:string|null,allWeights=false){
 if(allWeights){
  const rows=await db.collection('progressentries').where('user','==',userId).where('type','==','weight').get();let deleted=0;
  for(let i=0;i<rows.size;i+=300){deleted+=await db.runTransaction(async tx=>{const fresh=await tx.getAll(...rows.docs.slice(i,i+300).map(row=>row.ref));let count=0;for(const row of fresh)if(row.exists&&row.get('user')===userId&&row.get('type')==='weight'&&!row.get('deletedAt')){tx.update(row.ref,{deletedAt:new Date(),updatedAt:new Date()});count++;}return count;});}return deleted;
 }
 if(!id||!/^[a-f0-9]{24}$/.test(id))throw new NativeProgressError('Invalid entry ID',400);
 return db.runTransaction(async tx=>{const ref=db.collection('progressentries').doc(id),row=await tx.get(ref);if(!row.exists||row.get('user')!==userId)throw new NativeProgressError('Entry not found',404);if(!row.get('deletedAt'))tx.update(ref,{deletedAt:new Date(),updatedAt:new Date()});return 1;});
}
