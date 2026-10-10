import type * as MongoTypes from '@/lib/db/mongo-types';
import { randomBytes } from 'node:crypto';
import { getNativeDatabase } from '@/lib/db/database';
import { nativeHistoryAccess,nativeHistoryPage,nativeJson } from '@/lib/db/repository/native-history';
const suite=process.env.DTPS_MONGODB_LOCAL_TEST?describe:describe.skip;
suite('native history access and pagination',()=>{
 let db:ReturnType<typeof getNativeDatabase>;const refs:MongoTypes.DocumentReference[]=[];
 beforeAll(()=>{db=getNativeDatabase();});
 afterAll(async()=>{for(const ref of refs)await ref.delete();await db.terminate();});
 async function put(collection:string,data:MongoTypes.DocumentData){const ref=db.collection(collection).doc(randomBytes(12).toString('hex'));refs.push(ref);await ref.set(data);return ref;}
 it('allows self, admin and assigned dietitian but denies unrelated staff',async()=>{
  const client=await put('users',{assignedDietitians:['assigned']});
  for(const actor of [{id:client.id,role:'client'},{id:'admin',role:'admin'},{id:'assigned',role:'dietitian'}])expect((await nativeHistoryAccess(db,client.id,actor)).status).toBe(200);
  expect((await nativeHistoryAccess(db,client.id,{id:'unrelated',role:'dietitian'})).status).toBe(403);
 });
 it('retains total on empty later pages and returns standard JSON dates',async()=>{
  const userId=randomBytes(12).toString('hex'),now=new Date();
  await put('histories',{userId,category:'plan',createdAt:now,description:'synthetic'});
  await put('histories',{userId:'different',category:'plan',createdAt:now});
  const first=await nativeHistoryPage(db,userId,1,1,'plan');
  expect(first.total).toBe(1);expect(first.history).toHaveLength(1);
  expect((nativeJson(first.history) as any[])[0].createdAt).toBe(now.toISOString());
  expect(await nativeHistoryPage(db,userId,2,1,'plan')).toEqual({history:[],total:1});
 });
});
