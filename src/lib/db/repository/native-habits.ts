import {createHash,randomBytes} from 'node:crypto';
import type {Firestore,DocumentData} from 'firebase-admin/firestore';
import {formatInTimeZone,fromZonedTime} from 'date-fns-tz';
import {z} from 'zod';
import {taskDateError,TASK_TIME_ZONE,scheduledTaskTime} from '@/lib/task-schedule';
import {hydrateNativeDocument,prepareNativeDocument,prepareNativePatch} from '@/lib/storage/native-document';
import {nativeDates} from './native-plan-editor';
export type Habit='water'|'steps'|'sleep'|'activities';
export class NativeHabitError extends Error {constructor(message:string,public status=400){super(message);}}
export function nativeHabitDay(value:unknown){
 const key=value==null||value===''?formatInTimeZone(new Date(),TASK_TIME_ZONE,'yyyy-MM-dd'):value;
 if(typeof key!=='string'||scheduledTaskTime(key,'00:00')===null)throw new NativeHabitError('Invalid task date.');
 const start=fromZonedTime(key+'T00:00:00',TASK_TIME_ZONE),end=new Date(start.getTime()+86400000);
 return {key,start,end};
}
const query=(db:Firestore,userId:string,day:ReturnType<typeof nativeHabitDay>)=>db.collection('journaltrackings').where('client','==',userId).where('date','>=',day.start).where('date','<',day.end).limit(2);
export async function readNativeHabit(db:Firestore,userId:string,date:unknown){
 const day=nativeHabitDay(date),rows=await query(db,userId,day).get();if(rows.size>1)throw new NativeHabitError('Duplicate journal dates require reconciliation',409);
 return rows.empty?null:nativeDates(await hydrateNativeDocument(rows.docs[0].data()));
}
const amount=z.coerce.number().finite().nonnegative();
const schemas={
 water:z.object({amount:amount.positive().max(100000),unit:z.enum(['Glass (250ml)','Bottle (500ml)','Bottle (1L)','Cup (200ml)','glasses','ml']).default('ml'),type:z.string().max(100).default('water'),time:z.string().max(30).optional()}),
 steps:z.object({steps:amount.int().positive().max(200000)}),
 sleep:z.object({hours:amount.max(24),minutes:amount.max(59).default(0),quality:z.string().max(100).default('Good')}),
 activities:z.object({name:z.string().max(300).default('Exercise'),duration:amount.max(1440),intensity:z.enum(['low','light','moderate','high','vigorous']).default('moderate'),sets:amount.int().max(10000).default(0),reps:amount.int().max(100000).default(0)}),
};
export async function mutateNativeHabit(db:Firestore,userId:string,habit:Habit,date:unknown,action:'add'|'delete'|'complete'|'complete-entry',input:DocumentData={},operationKey?:string|null){
 const day=nativeHabitDay(date),dateError=taskDateError(day.key);if(dateError)throw new NativeHabitError(dateError);
 const parsed=action==='add'?schemas[habit].safeParse(input):null;if(parsed&&!parsed.success)throw new NativeHabitError('Invalid habit entry');
 const key=operationKey&&/^[a-zA-Z0-9._:-]{8,128}$/.test(operationKey)?operationKey:randomBytes(16).toString('hex');
 const entryId=createHash('sha256').update([userId,day.key,habit,key].join('\0')).digest('hex').slice(0,24),now=new Date();
 const data:DocumentData=parsed?.success?parsed.data:{};
 if(habit==='steps'){data.distance=Number((data.steps/1315).toFixed(2));data.calories=Math.round(data.steps*.04);}
 if(habit==='activities')data.completed=false;
 const fingerprint=createHash('sha256').update(JSON.stringify(data)).digest('hex');
 const entry={...data,_id:entryId,_nativeOperationHash:fingerprint,time:data.time||formatInTimeZone(now,TASK_TIME_ZONE,'h:mm a'),createdAt:now};
 return db.runTransaction(async tx=>{
  const rows=await tx.get(query(db,userId,day));if(rows.size>1)throw new NativeHabitError('Duplicate journal dates require reconciliation',409);
  const row=rows.docs[0],journal=row?nativeDates(await hydrateNativeDocument(row.data())):null;
  if(!journal&&action!=='add')throw new NativeHabitError('Entry or assignment not found',404);
  const list:DocumentData[]=journal?.[habit]||[];let patch:DocumentData={updatedAt:now};
  if(action==='add'){
   const existing=list.find(item=>item._id===entryId);
   if(existing){if(existing._nativeOperationHash!==fingerprint)throw new NativeHabitError('Habit retry conflicts with an existing entry',409);return {journal,entryId};}
   patch[habit]=[...list,entry];
  }else if(action==='delete'||action==='complete-entry'){
   if(typeof input.entryId!=='string'||!list.some(item=>item._id===input.entryId))throw new NativeHabitError('Entry not found',404);
   if(action==='complete-entry'&&habit!=='activities')throw new NativeHabitError('Invalid action');
   patch[habit]=action==='delete'?list.filter(item=>item._id!==input.entryId):list.map(item=>item._id===input.entryId?{...item,completed:true,completedAt:now}:item);
  }else{
   const field={water:'assignedWater',steps:'assignedSteps',sleep:'assignedSleep',activities:'assignedActivities'}[habit],assigned=journal![field];
   const target=habit==='water'?assigned?.amount:habit==='steps'?assigned?.target:habit==='sleep'?Number(assigned?.targetHours||0)+Number(assigned?.targetMinutes||0)/60:assigned?.activities?.length;
   if(!(target>0))throw new NativeHabitError('No assignment found for this date',404);
   patch[field]={...assigned,isCompleted:true,completedAt:assigned.completedAt||now,...(habit==='activities'?{activities:assigned.activities.map((item:any)=>({...item,completed:true,completedAt:item.completedAt||now}))}:{})};
  }
  if(row){tx.update(row.ref,await prepareNativePatch(row.data(),patch));return {journal:{...journal,...patch},entryId};}
  const ref=db.collection('journaltrackings').doc(createHash('sha256').update(userId+'\0'+day.key).digest('hex').slice(0,24));
  const conflict=await tx.get(ref);if(conflict.exists)throw new NativeHabitError('Journal identity conflict',409);
  const created={_id:ref.id,client:userId,date:day.start,water:[],steps:[],sleep:[],activities:[],targets:{steps:10000,water:2500,sleep:8,calories:2000,protein:150,carbs:250,fat:65,activityMinutes:60},createdAt:now,...patch};
  tx.create(ref,await prepareNativeDocument(created));return {journal:created,entryId};
 });
}
