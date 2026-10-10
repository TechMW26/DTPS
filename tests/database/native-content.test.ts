import type * as MongoTypes from '@/lib/db/mongo-types';
import {randomBytes} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/database';
import {nativeBlogLike,nativeBlogDetail,nativePublicBlogs} from '@/lib/db/repository/native-content';
const suite=process.env.DTPS_MONGODB_LOCAL_TEST?describe:describe.skip;
suite('native public content',()=>{
 let db:ReturnType<typeof getNativeDatabase>;const refs:MongoTypes.DocumentReference[]=[];
 beforeAll(()=>{db=getNativeDatabase();});afterAll(async()=>{for(const ref of refs)await ref.delete();await db.terminate();});
 async function blog(data:Record<string,unknown>){const ref=db.collection('blogs').doc(randomBytes(12).toString('hex'));refs.push(ref);await ref.set({isActive:true,publishedAt:new Date(),...data});return ref;}
 it('does not expose inactive content or internal fields',async()=>{
  const category=randomBytes(8).toString('hex');
  const active=await blog({category,title:'Safe',content:'Public text',internalNote:'private'});
  const hidden=await blog({category,isActive:false,title:'Hidden'});
  const rows=await nativePublicBlogs(db,{category,limit:10});expect(rows.map(row=>row._id)).toEqual([active.id]);expect(rows[0].internalNote).toBeUndefined();
  expect(await nativeBlogDetail(db,hidden.id)).toBeNull();
  const detail=await nativeBlogDetail(db,active.id);expect(detail?.blog.content).toBe('Public text');expect(detail?.blog.internalNote).toBeUndefined();
 });
 it('increments likes atomically and keeps unlike counts nonnegative',async()=>{
  const ref=await blog({likes:0});await Promise.all(Array.from({length:4},()=>nativeBlogLike(db,ref.id,'like')));
  expect((await ref.get()).get('likes')).toBe(4);
  await Promise.all(Array.from({length:6},()=>nativeBlogLike(db,ref.id,'unlike')));
  expect((await ref.get()).get('likes')).toBe(0);
 });
});
