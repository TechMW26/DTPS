import {randomBytes} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/database';
import {updateNativeBmi} from '@/lib/db/repository/native-bmi';
const suite=process.env.DTPS_MONGODB_LOCAL_TEST?describe:describe.skip;
suite('native starting weight lock',()=>{
 let db:ReturnType<typeof getNativeDatabase>;const refs:FirebaseFirestore.DocumentReference[]=[];
 beforeAll(()=>{db=getNativeDatabase();});afterAll(async()=>{for(const ref of refs)await ref.delete();await db.terminate();});
 it('allows only one concurrent starting weight and rejects invalid height without writing',async()=>{
  const ref=db.collection('users').doc(randomBytes(12).toString('hex'));refs.push(ref);await ref.set({heightCm:'170'});
  const results=await Promise.allSettled([60,70].map(weightKg=>updateNativeBmi(db,ref.id,{weightKg})));
  expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(1);
  const before=(await ref.get()).data();await expect(updateNativeBmi(db,ref.id,{heightCm:-1})).rejects.toMatchObject({status:400});
  expect((await ref.get()).data()).toEqual(before);
 });
});
