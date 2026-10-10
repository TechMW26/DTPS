import type * as MongoTypes from '@/lib/db/mongo-types';
import {randomBytes} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/database';
import {nativeHabitAssignment} from '@/lib/db/repository/native-habit-assignment';
import {nativeHabitDay,mutateNativeHabit} from '@/lib/db/repository/native-habits';
const suite=process.env.DTPS_MONGODB_LOCAL_TEST?describe:describe.skip;
suite('native staff task assignments',()=>{
 let db:ReturnType<typeof getNativeDatabase>;const refs:MongoTypes.DocumentReference[]=[];
 beforeAll(()=>{db=getNativeDatabase();});afterAll(async()=>{for(const ref of refs)await ref.delete();await db.terminate();});
 const id=()=>randomBytes(12).toString('hex');
 async function setup(){const staff=db.collection('users').doc(id()),client=db.collection('users').doc(id()),other=db.collection('users').doc(id());refs.push(staff,client,other);await staff.set({role:'dietitian',status:'active'});await other.set({role:'dietitian',status:'active'});await client.set({role:'client',assignedDietitian:staff.id});return {staff,client,other};}
 it('merges concurrent assignments and client entries into one dated journal',async()=>{
  const {staff,client}=await setup(),date=nativeHabitDay(null).key;
  await Promise.all([nativeHabitAssignment(db,staff.id,client.id,'water',date,'assign',{amount:2000}),nativeHabitAssignment(db,staff.id,client.id,'steps',date,'assign',{target:5000}),mutateNativeHabit(db,client.id,'water',date,'add',{amount:250,unit:'ml'},id())]);
  const rows=await db.collection('journaltrackings').where('client','==',client.id).get();refs.push(...rows.docs.map(row=>row.ref));expect(rows.size).toBe(1);const row=rows.docs[0];expect(row.get('assignedWater.amount')).toBe(2000);expect(row.get('assignedSteps.target')).toBe(5000);expect(row.get('water')).toHaveLength(1);
  await nativeHabitAssignment(db,staff.id,client.id,'water',date,'remove');expect((await row.ref.get()).get('assignedWater')).toBeNull();expect((await row.ref.get()).get('water')).toHaveLength(1);
 });
 it('denies unassigned staff and keeps future completion locked',async()=>{
  const {staff,client,other}=await setup();
  await expect(nativeHabitAssignment(db,other.id,client.id,'steps','2099-01-01','assign',{target:5000})).rejects.toMatchObject({status:403});
  await nativeHabitAssignment(db,staff.id,client.id,'steps','2099-01-01','assign',{target:5000});
  refs.push(...(await db.collection('journaltrackings').where('client','==',client.id).get()).docs.map(row=>row.ref));
  await expect(mutateNativeHabit(db,client.id,'steps','2099-01-01','complete')).rejects.toMatchObject({status:400});
 });
});
