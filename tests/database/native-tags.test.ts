import {randomBytes} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {saveNativeTag,deleteNativeTag,listNativeTags,getNativeTag} from '@/lib/db/repository/native-tags';
const suite=process.env.FIRESTORE_EMULATOR_HOST?describe:describe.skip;
suite('native tag catalog',()=>{
 let db:ReturnType<typeof getNativeDatabase>;const admin=randomBytes(12).toString('hex');
 beforeAll(async()=>{db=getNativeDatabase();await db.collection('users').doc(admin).set({role:'admin',status:'active'});});afterAll(async()=>{await db.collection('users').doc(admin).delete();await db.terminate();});
 const id=()=>randomBytes(12).toString('hex');
 it('serializes concurrent names and releases a name after deletion',async()=>{
  const name=id(),results=await Promise.allSettled([saveNativeTag(db,admin,{name}),saveNativeTag(db,admin,{name})]);
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  expect(results.find(r=>r.status==='rejected')).toMatchObject({reason:{status:409}});
  const tag=(results.find(r=>r.status==='fulfilled') as PromiseFulfilledResult<any>).value;
  await deleteNativeTag(db,tag._id,admin);await expect(getNativeTag(db,tag._id)).rejects.toMatchObject({status:404});
  const replacement=await saveNativeTag(db,admin,{name});await deleteNativeTag(db,replacement._id,admin);
 });
 it('keeps partial edits, uniqueness by type and staff filtering consistent',async()=>{
  const name=id(),tag=await saveNativeTag(db,admin,{name,description:'Keep this',color:'#abc',tagType:'dietitian'});
  const other=await saveNativeTag(db,admin,{name,tagType:'health_counselor'});
  const edited=await saveNativeTag(db,admin,{icon:'star'},tag._id);
  expect(edited.description).toBe('Keep this');expect(edited.color).toBe('#abc');expect(edited.tagType).toBe('dietitian');
  await expect(saveNativeTag(db,admin,{tagType:'health_counselor'},tag._id)).rejects.toMatchObject({status:409});
  expect((await listNativeTags(db,'dietitian',null)).map(t=>t._id)).toContain(tag._id);
  expect((await listNativeTags(db,'dietitian',null)).map(t=>t._id)).not.toContain(other._id);
  await deleteNativeTag(db,tag._id,admin);await deleteNativeTag(db,other._id,admin);
 });
});
