import {createHash} from 'node:crypto';
import type {MongoDatabase,DocumentData} from '@/lib/db/mongo-types';
import {z} from 'zod';
import {nativeHabitDay,NativeHabitError,type Habit} from './native-habits';
import {nativeDates} from './native-plan-editor';
import {hydrateNativeDocument,prepareNativeDocument,prepareNativePatch} from '@/lib/storage/native-document';
export const assignmentField={water:'assignedWater',steps:'assignedSteps',sleep:'assignedSleep',activities:'assignedActivities'} as const;
const activity=z.object({name:z.string().trim().min(1).max(300).default('Activity'),sets:z.number().int().min(0).max(10000).default(0),reps:z.number().int().min(0).max(100000).default(0),duration:z.number().min(0).max(1440).default(0),videoLink:z.union([z.literal(''),z.string().url().max(4000)]).default('')});
const schemas={water:z.object({amount:z.number().positive().max(100000)}),steps:z.object({target:z.number().int().positive().max(200000)}),sleep:z.object({targetHours:z.number().int().min(0).max(24),targetMinutes:z.number().int().min(0).max(59).default(0)}).refine(v=>v.targetHours*60+v.targetMinutes>0&&v.targetHours*60+v.targetMinutes<=1440),activities:z.object({activities:z.array(activity).min(1).max(100)})};
export async function nativeHabitAssignment(db:MongoDatabase,actorId:string,clientId:string,habit:Habit,date:unknown,action:'read'|'assign'|'remove',input?:unknown){
 if(!/^[a-f0-9]{24}$/.test(actorId)||!/^[a-f0-9]{24}$/.test(clientId))throw new NativeHabitError('Invalid user ID');
 const day=nativeHabitDay(date),parsed=action==='assign'?schemas[habit].safeParse(input):null;
 if(parsed&&!parsed.success)throw new NativeHabitError('Invalid task assignment');
 return db.runTransaction(async tx=>{
  const [actor,client]=await tx.getAll(db.collection('users').doc(actorId),db.collection('users').doc(clientId));
  const role=actor.get('role');if(!actor.exists||!['admin','dietitian','health_counselor'].includes(role)||actor.get('status')==='inactive')throw new NativeHabitError('Staff access required',403);
  if(!client.exists||client.get('role')!=='client')throw new NativeHabitError('Client not found',404);
  const assigned=role==='health_counselor'?[client.get('assignedHealthCounselor'),...(client.get('assignedHealthCounselors')||[])]:[client.get('assignedDietitian'),...(client.get('assignedDietitians')||[])];
  if(role!=='admin'&&!assigned.includes(actorId))throw new NativeHabitError('Client is not assigned to you',403);
  const rows=await tx.get(db.collection('journaltrackings').where('client','==',clientId).where('date','>=',day.start).where('date','<',day.end).limit(2));
  if(rows.size>1)throw new NativeHabitError('Duplicate journal dates require reconciliation',409);
  const row=rows.docs[0],journal:DocumentData=row?nativeDates(await hydrateNativeDocument(row.data())):{},field=assignmentField[habit],now=new Date();
  if(action!=='read'){
   const value:DocumentData|null=parsed?.success?{...parsed.data,assignedBy:actorId,assignedAt:now,isCompleted:false}:null;
   if(value?.activities)value.activities=value.activities.map((item:DocumentData)=>({...item,completed:false}));
   const patch={[field]:value,updatedAt:now};
   if(row)tx.update(row.ref,await prepareNativePatch(row.data(),patch));
   else if(action==='assign'){
    const ref=db.collection('journaltrackings').doc(createHash('sha256').update(clientId+'\0'+day.key).digest('hex').slice(0,24));
    if((await tx.get(ref)).exists)throw new NativeHabitError('Journal identity requires reconciliation',409);
    tx.create(ref,await prepareNativeDocument({_id:ref.id,client:clientId,date:day.start,water:[],steps:[],sleep:[],activities:[],meals:[],progress:[],bca:[],measurements:[],createdAt:now,...patch}));
   }
   Object.assign(journal,patch);
  }
  return {journal,day,clientName:[client.get('firstName'),client.get('lastName')].filter(Boolean).join(' ')};
 });
}
export function assignmentResponse(habit:Habit,result:Awaited<ReturnType<typeof nativeHabitAssignment>>){
 const {journal,day,clientName}=result,field=assignmentField[habit],assignment=journal[field]||null;
 const response:DocumentData={[field]:assignment,clientName,date:day.start.toISOString(),lastUpdated:journal.updatedAt||null};
 if(habit==='water'){const units:Record<string,number>={'Glass (250ml)':250,'Bottle (500ml)':500,'Bottle (1L)':1000,'Cup (200ml)':200,glasses:250,ml:1};response.totalWaterIntake=(journal.water||[]).reduce((sum:number,item:DocumentData)=>sum+Number(item.amount||0)*(units[item.unit]||1),0);}
 if(habit==='steps')response.currentSteps=(journal.steps||[]).reduce((sum:number,item:DocumentData)=>sum+Number(item.steps||0),0);
 if(habit==='sleep'){const minutes=(journal.sleep||[]).reduce((sum:number,item:DocumentData)=>sum+Number(item.hours||0)*60+Number(item.minutes||0),0);Object.assign(response,{currentSleepMinutes:minutes,currentSleepHours:Math.floor(minutes/60),currentSleepMins:minutes%60});}
 if(habit==='activities'&&assignment?.activities?.length)response[field]={...assignment,isCompleted:assignment.isCompleted||assignment.activities.every((item:DocumentData)=>item.completed)};
 return response;
}
