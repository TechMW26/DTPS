import {randomBytes} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/database';
import {updateNativeClientProfile,nativeClientProfile} from '@/lib/db/repository/native-client-profile';
const suite=process.env.DTPS_MONGODB_LOCAL_TEST?describe:describe.skip;
suite('native client profile',()=>{
 let db:ReturnType<typeof getNativeDatabase>;const refs:FirebaseFirestore.DocumentReference[]=[];
 beforeAll(()=>{db=getNativeDatabase();});
 afterAll(async()=>{for(const ref of refs)await ref.delete();await db.terminate();});
 async function user(data:FirebaseFirestore.DocumentData){const ref=db.collection('users').doc(randomBytes(12).toString('hex'));refs.push(ref);await ref.set(data);return ref;}
 it('locks the first weight atomically and never returns password or push tokens',async()=>{
  const ref=await user({role:'client',password:'private-synthetic',fcmTokens:['private-synthetic'],heightCm:'170'});
  const attempts=await Promise.allSettled([updateNativeClientProfile(db,ref.id,{weightKg:'70',role:'admin'}),updateNativeClientProfile(db,ref.id,{weightKg:'80'})]);
  expect(attempts.filter(result=>result.status==='fulfilled')).toHaveLength(1);
  const stored=(await ref.get()).data()!;expect(stored.role).toBe('client');expect(stored.firstWeight.isLocked).toBe(true);
  const profile=await nativeClientProfile(db,ref.id);expect(profile?.password).toBeUndefined();expect(profile?.fcmTokens).toBeUndefined();
  expect(Number(profile?.bmi)).toBeCloseTo(Number(stored.weightKg)/1.7**2,1);
 });
 it('removes superseded private field references when an avatar is replaced',async()=>{
  const ref=await user({avatar:null,_nativeExternalFields:[{path:['avatar'],encoding:'utf8',file:{url:'synthetic-unused'}}]});
  await updateNativeClientProfile(db,ref.id,{avatar:'https://example.invalid/avatar.jpg'});
  expect((await ref.get()).get('_nativeExternalFields')).toEqual([]);
  expect((await nativeClientProfile(db,ref.id))?.avatar).toBe('https://example.invalid/avatar.jpg');
 });
});
