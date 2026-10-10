import type * as MongoTypes from '@/lib/db/mongo-types';
import {prepareNativeDocument,hydrateNativeDocument} from '@/lib/storage/native-document';
import {randomBytes} from 'node:crypto';
import {nativeHabitDay} from '@/lib/db/repository/native-habits';
import {getNativeDatabase} from '@/lib/db/database';
import {nativeTaskJournal,completeNativeTask} from '@/lib/db/repository/native-client-tasks';
const files=new Map<string,Buffer>();
jest.mock('@/lib/storage/migration-blob-storage',()=>({storeNativeFile:async(bytes:Buffer,contentType:string)=>{const sha256=require('node:crypto').createHash('sha256').update(bytes).digest('hex');files.set(sha256,Buffer.from(bytes));return {provider:'vercel-blob',sha256,size:bytes.length,contentType,storeId:'test',pathname:sha256,url:'https://test.private.blob.vercel-storage.com/'+sha256};},readNativeFile:async(ref:{sha256:string})=>Buffer.from(files.get(ref.sha256)!)}));
const suite=process.env.DTPS_MONGODB_LOCAL_TEST?describe:describe.skip;
suite('native task completion',()=>{
 let db:ReturnType<typeof getNativeDatabase>;const refs:MongoTypes.DocumentReference[]=[];
 beforeAll(()=>{db=getNativeDatabase();});
 afterAll(async()=>{for(const ref of refs)await ref.delete();await db.terminate();});
 it('keeps concurrent activity completions and does not modify another client journal',async()=>{
  const client=randomBytes(12).toString('hex'),date=nativeHabitDay('2026-01-01').start;
  const ref=db.collection('journaltrackings').doc(randomBytes(12).toString('hex'));refs.push(ref);
  await ref.set({client,date,assignedActivities:{activities:[{name:'one'},{name:'two'}]},assignedWater:{amount:2000}});
  await Promise.all([completeNativeTask(db,client,'2026-01-01','activity',0),completeNativeTask(db,client,'2026-01-01','activity',1)]);
  expect((await ref.get()).get('assignedActivities.isCompleted')).toBe(true);
  expect((await ref.get()).get('assignedActivities.activities').every((x:any)=>x.completed)).toBe(true);
  expect(await completeNativeTask(db,'other','2026-01-01','water')).toBe(false);
  expect((await ref.get()).get('assignedWater.isCompleted')).toBeUndefined();
  const end=new Date(date);end.setDate(end.getDate()+1);
  expect((await nativeTaskJournal(db,client,date,end))?.assignedActivities.activities).toHaveLength(2);
 });
 it('hydrates large archived activity fields and preserves them when completing',async()=>{
  const client=randomBytes(12).toString('hex'),date=nativeHabitDay('2026-01-01').start;
  const ref=db.collection('journaltrackings').doc(randomBytes(12).toString('hex'));refs.push(ref);
  const notes='x'.repeat(1_200_000);
  await ref.set(await prepareNativeDocument({client,date,assignedActivities:{activities:[{name:'Walk',notes}]}}));
  expect((await ref.get()).get('_nativeExternalFields').length).toBeGreaterThan(0);
  expect(await completeNativeTask(db,client,'2026-01-01','activity',0)).toBe(true);
  const restored=await hydrateNativeDocument((await ref.get()).data()!);
  expect(restored.assignedActivities.activities[0]).toMatchObject({completed:true,notes});
  const {end}=nativeHabitDay('2026-01-01');
  expect((await nativeTaskJournal(db,client,date,end))?.assignedActivities.activities[0].notes).toBe(notes);
 });
 it('rejects upcoming dates and invalid array indexes before writing',async()=>{
  await expect(completeNativeTask(db,'synthetic','2999-01-01','water')).rejects.toThrow('Upcoming');
  await expect(completeNativeTask(db,'synthetic','2026-01-01','activity',-1)).rejects.toThrow('Invalid activity');
 });
});
