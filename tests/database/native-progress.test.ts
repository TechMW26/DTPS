import {randomBytes} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/database';
import {saveNativeProgress,deleteNativeProgress,nativeProgressHistory} from '@/lib/db/repository/native-progress';
const suite=process.env.DTPS_MONGODB_LOCAL_TEST?describe:describe.skip;
suite('native progress persistence',()=>{
 let db:ReturnType<typeof getNativeDatabase>;const users:string[]=[];
 beforeAll(()=>{db=getNativeDatabase();});afterAll(async()=>{for(const user of users)for(const [collection,field] of [['progressentries','user'],['journaltrackings','client'],['_nativeProgressOperations','userId']]){const rows=await db.collection(collection).where(field,'==',user).get();for(const row of rows.docs)await row.ref.delete();}await db.terminate();});
 const user=()=>{const id=randomBytes(12).toString('hex');users.push(id);return id;};
 it('atomically writes measurements to history and the journal exactly once',async()=>{
  const id=user(),key=randomBytes(12).toString('hex'),data={type:'measurements',measurements:{waist:80,arms:30}};
  const results=await Promise.all([saveNativeProgress(db,id,data,key),saveNativeProgress(db,id,data,key)]);
  expect(results.filter(row=>row.created)).toHaveLength(1);
  expect((await db.collection('progressentries').where('user','==',id).get()).size).toBe(2);
  const journal=await db.collection('journaltrackings').where('client','==',id).get();expect(journal.size).toBe(1);expect(journal.docs[0].get('measurements')).toHaveLength(1);
 });
 it('does not expose another user entries and prevents deleted retry resurrection',async()=>{
  const id=user(),other=user(),key=randomBytes(12).toString('hex'),data={type:'weight',value:65};
  const result=await saveNativeProgress(db,id,data,key),entry=result.entries[0];
  await expect(deleteNativeProgress(db,other,entry._id)).rejects.toMatchObject({status:404});
  expect((await nativeProgressHistory(db,other,new Date(0),true)).allProgressEntries).toEqual([]);
  await deleteNativeProgress(db,id,entry._id);expect((await nativeProgressHistory(db,id,new Date(0),true)).allProgressEntries).toEqual([]);
  await expect(saveNativeProgress(db,id,data,key)).rejects.toMatchObject({status:409});
 });
});
