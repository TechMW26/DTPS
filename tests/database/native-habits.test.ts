import {randomBytes} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {mutateNativeHabit,readNativeHabit,nativeHabitDay} from '@/lib/db/repository/native-habits';
const suite=process.env.FIRESTORE_EMULATOR_HOST?describe:describe.skip;
suite('native daily habit journal',()=>{
 let db:ReturnType<typeof getNativeDatabase>;const users:string[]=[];
 beforeAll(()=>{db=getNativeDatabase();});afterAll(async()=>{for(const user of users){const rows=await db.collection('journaltrackings').where('client','==',user).get();for(const row of rows.docs)await row.ref.delete();}await db.terminate();});
 const user=()=>{const id=randomBytes(12).toString('hex');users.push(id);return id;};
 it('merges simultaneous water and steps updates without duplicate daily journals',async()=>{
  const id=user(),date='2026-01-01';
  await Promise.all([mutateNativeHabit(db,id,'water',date,'add',{amount:250}),mutateNativeHabit(db,id,'steps',date,'add',{steps:100})]);
  const journal=await readNativeHabit(db,id,date);expect(journal.water).toHaveLength(1);expect(journal.steps).toHaveLength(1);
  expect((await db.collection('journaltrackings').where('client','==',id).get()).size).toBe(1);
 });
 it('deduplicates retries and rejects changed content, invalid values, and future logging',async()=>{
  const id=user(),key=randomBytes(12).toString('hex');
  await Promise.all([1,2].map(()=>mutateNativeHabit(db,id,'sleep','2026-01-02','add',{hours:8},key)));
  expect((await readNativeHabit(db,id,'2026-01-02')).sleep).toHaveLength(1);
  await expect(mutateNativeHabit(db,id,'sleep','2026-01-02','add',{hours:7},key)).rejects.toMatchObject({status:409});
  await expect(mutateNativeHabit(db,id,'steps','2026-01-02','add',{steps:-5})).rejects.toMatchObject({status:400});
  await expect(mutateNativeHabit(db,id,'water','2099-01-02','add',{amount:200})).rejects.toThrow('Upcoming');
  expect(()=>nativeHabitDay('2026-02-30')).toThrow('Invalid');
 });
 it('requires an actual assignment and isolates entry deletion to its owner',async()=>{
  const id=user(),other=user(),date='2026-01-03';
  const {entryId}=await mutateNativeHabit(db,id,'water',date,'add',{amount:100});
  await expect(mutateNativeHabit(db,id,'water',date,'complete')).rejects.toMatchObject({status:404});
  await expect(mutateNativeHabit(db,other,'water',date,'delete',{entryId})).rejects.toMatchObject({status:404});
  await mutateNativeHabit(db,id,'water',date,'delete',{entryId});
  expect((await readNativeHabit(db,id,date)).water).toHaveLength(0);
 });
});
