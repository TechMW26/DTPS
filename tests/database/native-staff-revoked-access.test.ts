import {nativeCommerceAdmin} from '@/lib/db/repository/native-staff-ecommerce';
import {taskClientAccess} from '@/lib/db/repository/native-staff-tasks';
import {randomBytes} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/database';
import {assignedNativeClient} from '@/lib/db/repository/native-staff-client';
import {nativeDraft} from '@/lib/db/repository/native-staff-drafts';
import {nativeAppointmentActor,mutateStaffAppointment} from '@/lib/db/repository/native-staff-appointments';
import {saveNativeAppointmentConfig} from '@/lib/db/repository/native-staff-appointment-config';
import {saveProviderAvailability} from '@/lib/db/repository/native-staff-availability';
import {nativeDailyTracking} from '@/lib/db/repository/native-staff-tracking';
const suite=process.env.DTPS_MONGODB_LOCAL_TEST?describe:describe.skip;
suite('revoked accounts cannot use native staff or self-service paths',()=>{
 let db:ReturnType<typeof getNativeDatabase>;const id=()=>randomBytes(12).toString('hex');
 beforeAll(()=>{db=getNativeDatabase();});afterAll(()=>db.terminate());
 it.each([{status:'suspended'},{status:'active',isActive:false}])('rejects a revoked persisted actor %p before any mutation',async(revoked)=>{
  const actor=id(),client=id();await db.collection('users').doc(actor).set({role:'admin',...revoked});await db.collection('users').doc(client).set({role:'client',status:'active',assignedDietitian:actor});
  await expect(nativeCommerceAdmin(db,actor)).rejects.toMatchObject({status:403});
  await expect(taskClientAccess(db,actor,client)).rejects.toMatchObject({status:401});
  await expect(assignedNativeClient(db,actor,client,undefined,true)).rejects.toMatchObject({status:403});
  await expect(nativeDraft(db,actor,'plan',client,'POST',{name:'Must not save'})).rejects.toMatchObject({status:401});
  await expect(nativeAppointmentActor(db,actor)).rejects.toMatchObject({status:401});
  await expect(mutateStaffAppointment(db,actor,{clientId:client,dietitianId:actor,scheduledAt:'2099-01-01T10:00:00Z',duration:30})).rejects.toMatchObject({status:401});
  await expect(saveNativeAppointmentConfig(db,actor,{resource:'type',name:id(),duration:30})).rejects.toMatchObject({status:403});
  await expect(saveProviderAvailability(db,actor,{slots:[{dayOfWeek:1,startTime:'09:00',endTime:'10:00'}]})).rejects.toMatchObject({status:403});
  await expect(nativeDailyTracking(db,actor,'steps',{steps:100})).rejects.toMatchObject({status:401});
  expect((await db.collection('drafts').where('userId','==',actor).get()).empty).toBe(true);
 });
});
