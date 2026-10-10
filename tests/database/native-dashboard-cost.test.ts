import type * as MongoTypes from '@/lib/db/mongo-types';
import {randomBytes} from 'node:crypto';
import {MongoQuery as Query} from '@/lib/db/mongo-native';
import {getNativeDatabase} from '@/lib/db/database';
import {nativeStaffStats} from '@/lib/db/repository/native-staff-dashboard';
const suite=process.env.DTPS_MONGODB_LOCAL_TEST?describe:describe.skip;
suite('dashboard read reuse',()=>{
 let db:ReturnType<typeof getNativeDatabase>;const refs:MongoTypes.DocumentReference[]=[];
 beforeAll(()=>{db=getNativeDatabase();});
 afterAll(async()=>{for(const ref of refs)await ref.delete();await db.terminate();});
 async function row(collection:string,data:Record<string,unknown>){const ref=db.collection(collection).doc(randomBytes(12).toString('hex'));refs.push(ref);await ref.set(data);return ref.id;}
 it.each(['dietitian','health_counselor'] as const)('preserves schedule totals and access scope with three fewer count queries for %s',async kind=>{
  const actor=await row('users',{role:kind,status:'active'});
  const client=await row('users',{role:'client',status:'active',firstName:'Synthetic',createdAt:new Date(),assignedDietitian:actor,assignedHealthCounselor:actor});
  const start=new Date();start.setHours(0,0,0,0);
  const at=(days:number)=>new Date(start.getTime()+days*86400000+3600000);
  for(const status of ['scheduled','confirmed','rescheduled','pending','completed','cancelled'])await row('appointments',{dietitian:actor,healthCounselor:actor,client,status,scheduledAt:at(0)});
  await row('appointments',{dietitian:actor,healthCounselor:actor,client,status:'confirmed',scheduledAt:at(-1)});
  await row('appointments',{dietitian:actor,healthCounselor:actor,client,status:'cancelled',scheduledAt:at(-1)});
  await row('appointments',{dietitian:actor,healthCounselor:actor,client,status:'pending',scheduledAt:at(1)});
  await row('appointments',{dietitian:'outside',healthCounselor:'outside',client,status:'pending',scheduledAt:at(0)});
  for(let i=0;i<12;i++)await row('tasks',{dietitian:actor,client,status:i===0?'cancelled':'pending',startDate:at(-1),endDate:at(1),createdAt:new Date(start.getTime()+i),title:`Task ${i}`});
  const counts=jest.spyOn(Query.prototype,'count');
  try{
   const result=await nativeStaffStats(db,actor,kind);
   expect(counts).toHaveBeenCalledTimes(3);
   expect(result).toMatchObject({todaysAppointments:6,confirmedAppointments:3,pendingAppointments:1,completedSessions:1,completionRate:50});
   expect(result.todaysSchedule).toHaveLength(6);
   if(kind==='dietitian'){
    expect(result.todayTasks).toHaveLength(10);
    expect(result.todayTasks!.map((task:any)=>task.title)).toEqual(Array.from({length:10},(_,i)=>`Task ${11-i}`));
   }
  }finally{counts.mockRestore();}
 });
});
