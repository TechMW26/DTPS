import type * as MongoTypes from '@/lib/db/mongo-types';
import {randomBytes} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/database';
import {mutateJournal,journalHistory} from '@/lib/db/repository/native-journal';
const suite=process.env.DTPS_MONGODB_LOCAL_TEST?describe:describe.skip;
suite('native staff journal',()=>{
 let db:ReturnType<typeof getNativeDatabase>;const refs:MongoTypes.DocumentReference[]=[];const clients:string[]=[];
 beforeAll(()=>{db=getNativeDatabase();});afterAll(async()=>{for(const client of clients)for(const collection of ['journaltrackings','progressentries','activitylogs']){const field=collection==='progressentries'?'user':collection==='activitylogs'?'targetUserId':'client';for(const row of(await db.collection(collection).where(field,'==',client).get()).docs)await row.ref.delete();}for(const ref of refs)await ref.delete();await db.terminate();});
 async function fixtures(){const admin=db.collection('users').doc(randomBytes(12).toString('hex')),client=db.collection('users').doc(randomBytes(12).toString('hex'));refs.push(admin,client);clients.push(client.id);await admin.set({role:'admin',status:'active'});await client.set({role:'client',status:'active',heightCm:170});return {admin,client};}
 it('concurrently appends without lost updates and enforces idempotent retries',async()=>{
  const {admin,client}=await fixtures();const results=await Promise.all([mutateJournal(db,admin.id,client.id,'steps','2026-01-03','add',{steps:100},'synthetic-one'),mutateJournal(db,admin.id,client.id,'steps','2026-01-03','add',{steps:200},'synthetic-two')]);
  await mutateJournal(db,admin.id,client.id,'steps','2026-01-03','add',{steps:100},'synthetic-one');const journals=await journalHistory(db,client.id);expect(journals).toHaveLength(1);expect(journals[0].steps).toHaveLength(2);expect(journals[0].steps.reduce((n:number,row:any)=>n+row.steps,0)).toBe(300);
  await expect(mutateJournal(db,admin.id,client.id,'steps','2026-01-03','add',{steps:999},'synthetic-one')).rejects.toThrow('retry conflict');
 });
 it('atomically mirrors measurement entries and deletes their linked tracker records',async()=>{
  const {admin,client}=await fixtures();const result=await mutateJournal(db,admin.id,client.id,'measurements','2026-01-03','add',{arm:30,waist:80},'measurement');
  expect((await db.collection('progressentries').where('user','==',client.id).get()).size).toBe(2);
  await mutateJournal(db,admin.id,client.id,'measurements',null,'delete',{entryId:result.entry!._id});
  expect((await journalHistory(db,client.id))[0].measurements).toHaveLength(0);expect((await db.collection('progressentries').where('user','==',client.id).get()).size).toBe(0);
 });
 it('reconciles assigned completion when a logged target is removed',async()=>{
  const {admin,client}=await fixtures();const first=await mutateJournal(db,admin.id,client.id,'steps','2026-01-03','add',{steps:100},'first');
  const journal=(await journalHistory(db,client.id))[0];await db.collection('journaltrackings').doc(journal._id).update({assignedSteps:{target:300,isCompleted:false,assignedBy:admin.id}});
  const second=await mutateJournal(db,admin.id,client.id,'steps','2026-01-03','add',{steps:200},'second');expect(second.journal.assignedSteps.isCompleted).toBe(true);
  const removed=await mutateJournal(db,admin.id,client.id,'steps','2026-01-03','delete',{entryId:first.entry!._id});expect(removed.journal.assignedSteps.isCompleted).toBe(false);expect(removed.journal.assignedSteps.completedAt).toBeNull();
 });
 it('rejects revoked staff access and validates nested targets',async()=>{
  const {admin,client}=await fixtures();await mutateJournal(db,admin.id,client.id,'targets','2026-01-03','add',{targets:{water:3000,client:'forged'}});
  expect((await journalHistory(db,client.id))[0].targets.water).toBe(3000);await admin.update({role:'dietitian'});
  await expect(mutateJournal(db,admin.id,client.id,'steps','2026-01-03','add',{steps:100})).rejects.toThrow('access denied');
 });
});
