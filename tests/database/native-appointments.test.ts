import type * as MongoTypes from '@/lib/db/mongo-types';
import {randomBytes} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/database';
import {bookNativeClientAppointment,nativeClientAppointments} from '@/lib/db/repository/native-appointments';
const suite=process.env.DTPS_MONGODB_LOCAL_TEST?describe:describe.skip;
suite('native appointment booking',()=>{
 let db:ReturnType<typeof getNativeDatabase>;const refs:MongoTypes.DocumentReference[]=[];
 beforeAll(()=>{db=getNativeDatabase();});afterAll(async()=>{for(const ref of refs)await ref.delete();await db.terminate();});
 const id=()=>randomBytes(12).toString('hex');
 async function setup(){const staff=db.collection('users').doc(id()),client=db.collection('users').doc(id());refs.push(staff,client);await staff.set({role:'dietitian',status:'active',firstName:'Synthetic',password:'private'});await client.set({role:'client',assignedDietitian:staff.id});return {staff,client};}
 const time=()=>new Date(Date.now()+86400000).toISOString();
 it('allows exactly one of two concurrent overlapping bookings',async()=>{
  const {staff,client}=await setup(),scheduledAt=time();
  const results=await Promise.allSettled([1,2].map(()=>bookNativeClientAppointment(db,client.id,{dietitianId:staff.id,scheduledAt})));
  expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(1);
  for(const result of results)if(result.status==='fulfilled')refs.push(db.collection('appointments').doc(result.value.appointment.id));
  expect(results.find(result=>result.status==='rejected')).toMatchObject({reason:{status:409}});
 });
 it('deduplicates retries and does not expose another client appointments',async()=>{
  const {staff,client}=await setup(),payload={dietitianId:staff.id,scheduledAt:time()},key=id();
  const first=await bookNativeClientAppointment(db,client.id,payload,key);refs.push(db.collection('appointments').doc(first.appointment.id));
  const retry=await bookNativeClientAppointment(db,client.id,payload,key);expect(retry.created).toBe(false);expect(retry.appointment.id).toBe(first.appointment.id);
  expect(await nativeClientAppointments(db,id(),null,1,50)).toEqual([]);
  await client.update({assignedDietitian:id()});await expect(bookNativeClientAppointment(db,client.id,payload)).rejects.toMatchObject({status:403});
 });
});
