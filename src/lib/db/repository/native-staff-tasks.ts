import {randomBytes,createHash} from 'node:crypto';
import {z} from 'zod';
import type {Firestore,Transaction,DocumentData,Query} from 'firebase-admin/firestore';
import {formatInTimeZone} from 'date-fns-tz';
import {taskScheduleError,scheduledTaskTime,TASK_TIME_ZONE} from '@/lib/task-schedule';
import {hydrateNativeDocument,prepareNativeDocument,prepareNativePatch} from '@/lib/storage/native-document';
import {nativeJson} from './native-history';
import {nativeDates} from './native-plan-editor';
import {NativeStaffClientError} from './native-staff-client';
export async function taskClientAccess(db:Firestore,actorId:string,clientId:string,tx?:Transaction){
 if(!/^[a-f0-9]{24}$/.test(clientId))throw new NativeStaffClientError('Invalid client ID');const refs=[db.collection('users').doc(actorId),db.collection('users').doc(clientId)],rows=tx?await tx.getAll(...refs):await db.getAll(...refs),[actor,client]=rows;
 if(!actor.exists||(['inactive','suspended'].includes(actor.get('status'))||actor.get('isActive')===false))throw new NativeStaffClientError('Unauthorized',401);if(!client.exists||client.get('role')!=='client')throw new NativeStaffClientError('Client not found',404);
 const role=actor.get('role'),assigned=[client.get('assignedDietitian'),...(client.get('assignedDietitians')||[]),client.get('assignedHealthCounselor'),...(client.get('assignedHealthCounselors')||[])];
 if(role!=='admin'&&!(role==='client'&&actorId===clientId)&&!(['dietitian','health_counselor'].includes(role)&&assigned.includes(actorId)))throw new NativeStaffClientError('Client access denied',403);return {actor,client};
}
const schema=z.object({taskType:z.enum(['General Followup','Habit Update','Session Booking','Sign Document','Form Allotment','Report Upload','Diary Update','Measurement Update','BCA Update','Progress Update']),title:z.string().trim().max(300).optional(),description:z.string().max(2000).optional(),startDate:z.coerce.date(),endDate:z.coerce.date(),allottedTime:z.string().regex(/^(?:\d{1,2}):\d{2}(?:\s*[AP]M)?$/i).optional(),repeatFrequency:z.number().int().min(0).max(365).optional(),notifyClientOnChat:z.boolean().optional(),notifyDieticianOnCompletion:z.string().max(300).optional(),status:z.enum(['pending','in-progress','completed','cancelled']).optional(),tags:z.array(z.string().regex(/^[a-f0-9]{24}$/)).max(1).optional(),operationId:z.string().min(1).max(128).optional()});
export async function taskViews(db:Firestore,rows:FirebaseFirestore.DocumentSnapshot[]){
 const data:DocumentData[]=await Promise.all(rows.map(async d=>({_id:d.id,...await hydrateNativeDocument(d.data()!)}))),users=[...new Set(data.flatMap(t=>[t.client,t.dietitian]).filter(id=>typeof id==='string'&&/^[a-f0-9]{24}$/.test(id)))],tags=[...new Set(data.flatMap(t=>t.tags||[]))],um=new Map(),tm=new Map();
 for(let i=0;i<users.length;i+=100){const docs=await db.getAll(...users.slice(i,i+100).map(id=>db.collection('users').doc(id)),{fieldMask:['firstName','lastName','email']});for(const d of docs)if(d.exists)um.set(d.id,{_id:d.id,...d.data()});}
 for(let i=0;i<tags.length;i+=100){const docs=await db.getAll(...tags.slice(i,i+100).map(id=>db.collection('tags').doc(id)),{fieldMask:['name','color','icon']});for(const d of docs)if(d.exists)tm.set(d.id,{_id:d.id,...d.data()});}
 for(const t of data){t.client=um.get(t.client)||t.client;t.dietitian=um.get(t.dietitian)||t.dietitian;t.tags=(t.tags||[]).map((id:string)=>tm.get(id)).filter(Boolean);delete t._nativeExternalFields;delete t._nativeSource;}return nativeJson(data) as DocumentData[];
}
export async function readStaffTasks(db:Firestore,actorId:string,clientId:string,params:URLSearchParams,taskId?:string){
 await taskClientAccess(db,actorId,clientId);if(taskId){if(!/^[a-f0-9]{24}$/.test(taskId))throw new NativeStaffClientError('Invalid task ID');const doc=await db.collection('tasks').doc(taskId).get();if(!doc.exists||doc.get('client')!==clientId)throw new NativeStaffClientError('Task not found',404);return {task:(await taskViews(db,[doc]))[0]};}
 let q:Query=db.collection('tasks').where('client','==',clientId);const status=params.get('status');if(status)q=q.where('status','==',status);for(const [key,op] of [['startDate','>='],['endDate','<=']] as const){const value=params.get(key);if(value){const d=new Date(value);if(!Number.isFinite(d.getTime()))throw new NativeStaffClientError('Invalid date');q=q.where('startDate',op,d);}}
 return {tasks:await taskViews(db,(await q.orderBy('startDate','asc').get()).docs)};
}
export async function mutateStaffTask(db:Firestore,actorId:string,clientId:string,input:unknown,taskId?:string,remove=false){
 if(taskId&&!/^[a-f0-9]{24}$/.test(taskId))throw new NativeStaffClientError('Invalid task ID');const raw=input as DocumentData;if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new NativeStaffClientError('Invalid task');const patch:DocumentData=remove?{}:taskId?schema.partial().parse(raw):schema.parse(raw);
 const id=taskId||(patch.operationId?createHash('sha256').update(clientId+'\0'+actorId+'\0'+patch.operationId).digest('hex').slice(0,24):randomBytes(12).toString('hex')),ref=db.collection('tasks').doc(id);
 await db.runTransaction(async tx=>{
  const {actor}=await taskClientAccess(db,actorId,clientId,tx),doc=await tx.get(ref),role=actor.get('role'),current=doc.exists?nativeDates(await hydrateNativeDocument(doc.data()!)):null;
  if(taskId&&(!current||current.client!==clientId))throw new NativeStaffClientError('Task not found',404);
  if(!taskId&&doc.exists){if(doc.get('client')===clientId&&doc.get('dietitian')===actorId)return;throw new NativeStaffClientError('Task identity conflict',409);}
  if(role==='client'){
   if(!taskId||remove||Object.keys(raw).some(k=>k!=='status')||patch.status!=='completed')throw new NativeStaffClientError('Clients can only complete their own tasks',403);
   const error=taskScheduleError(formatInTimeZone(current!.startDate,TASK_TIME_ZONE,'yyyy-MM-dd'),current!.allottedTime||'00:00');if(error)throw new NativeStaffClientError(error.replace(/meal/g,'task'));
  }else if(role!=='admin'&&current?.dietitian&&current.dietitian!==actorId)throw new NativeStaffClientError('You can only change tasks you created',403);
  const next={...current,...patch},now=new Date();if(!remove&&next.startDate>next.endDate)throw new NativeStaffClientError('Start date cannot be after end date');if(!remove&&scheduledTaskTime(formatInTimeZone(next.startDate,TASK_TIME_ZONE,'yyyy-MM-dd'),next.allottedTime||'12:00 AM')===null)throw new NativeStaffClientError('Invalid allotted time');
  if(remove)tx.delete(ref);else if(current)tx.update(ref,await prepareNativePatch(doc.data()!,{...patch,updatedAt:now}));else tx.create(ref,await prepareNativeDocument({description:'',allottedTime:'12:00 AM',repeatFrequency:0,notifyClientOnChat:false,status:'pending',tags:[],...patch,title:patch.title||patch.taskType,_id:id,client:clientId,dietitian:actorId,creatorRole:role,createdAt:now,updatedAt:now}));
  const audit=randomBytes(12).toString('hex');tx.create(db.collection('activitylogs').doc(audit),{_id:audit,userId:actorId,userRole:role,targetUserId:clientId,action:remove?'Deleted Task':taskId?'Updated Task':'Created Task',actionType:remove?'delete':taskId?'update':'create',category:'task',resourceId:id,resourceType:'Task',createdAt:now,updatedAt:now});
  tx.set(db.collection('_nativeRealtime').doc(clientId),{tasksUpdatedAt:now},{merge:true});
 });return remove?null:(await taskViews(db,[await ref.get()]))[0];
}
