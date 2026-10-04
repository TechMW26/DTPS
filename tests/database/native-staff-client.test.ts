import {randomBytes} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {assignedNativeClient,updateStaffClient,staffClientView} from '@/lib/db/repository/native-staff-client';
import {nativeStaffRecall} from '@/lib/db/repository/native-staff-recall';
const suite=process.env.FIRESTORE_EMULATOR_HOST?describe:describe.skip;
suite('native staff client access',()=>{
 let db:ReturnType<typeof getNativeDatabase>;beforeAll(()=>{db=getNativeDatabase();});afterAll(async()=>{await db.terminate();});const id=()=>randomBytes(12).toString('hex');
 it('checks current assignment and reserves changed contacts without leaking credentials',async()=>{
  const actor=id(),client=id(),other=id(),email=`${id()}@example.test`;
  await db.collection('users').doc(actor).set({role:'dietitian',status:'active'});await db.collection('users').doc(client).set({role:'client',assignedDietitians:[actor],password:'secret',fcmToken:'secret',firstName:'Test',email});
  const data=await updateStaffClient(db,actor,client,{firstName:'Updated',goals:{water:8},role:'admin',password:'new'});expect(data).toMatchObject({firstName:'Updated',goals:{water:8}});expect(data).not.toHaveProperty('password');expect(data).not.toHaveProperty('fcmToken');expect((await db.collection('users').doc(client).get()).get('role')).toBe('client');
  await db.collection('users').doc(other).set({role:'client',email:`${other}@example.test`});await expect(updateStaffClient(db,actor,client,{email:`${other}@example.test`})).rejects.toMatchObject({status:409});
  await db.collection('users').doc(client).update({assignedDietitians:[]});await expect(assignedNativeClient(db,actor,client)).rejects.toMatchObject({status:403});
 });
 it('updates the latest recall rather than an arbitrary day and rejects a stale editor',async()=>{
  const actor=id(),client=id(),old=id(),latest=id();await db.collection('users').doc(actor).set({role:'dietitian',status:'active'});await db.collection('users').doc(client).set({role:'client',assignedDietitian:actor});
  await db.collection('dietaryrecalls').doc(old).set({userId:client,updatedAt:new Date('2026-01-01'),meals:[]});await db.collection('dietaryrecalls').doc(latest).set({userId:client,updatedAt:new Date('2026-01-02'),meals:[]});
  expect(((await nativeStaffRecall(db,actor,client)).data as any)._id).toBe(latest);await expect(nativeStaffRecall(db,actor,client,{_id:old,meals:[]})).rejects.toMatchObject({status:409});await nativeStaffRecall(db,actor,client,{_id:latest,meals:[{mealType:'Lunch',hour:'01',minute:'00',meridian:'PM',food:'Rice'}]});expect((await db.collection('dietaryrecalls').doc(old).get()).get('meals')).toEqual([]);expect((await db.collection('dietaryrecalls').doc(latest).get()).get('meals')).toHaveLength(1);
 });
});
