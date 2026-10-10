import {randomBytes} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/database';
import {completeNativeOnboarding} from '@/lib/db/repository/native-onboarding';
const suite=process.env.DTPS_MONGODB_LOCAL_TEST?describe:describe.skip;
suite('native onboarding atomicity',()=>{
 let db:ReturnType<typeof getNativeDatabase>;const ids:string[]=[];
 beforeAll(()=>{db=getNativeDatabase();});afterAll(async()=>{for(const id of ids){await db.collection('users').doc(id).delete();for(const collection of ['medicalinfos','lifestyleinfos']){const rows=await db.collection(collection).where('userId','==',id).get();for(const row of rows.docs)await row.ref.delete();}}await db.terminate();});
 async function user(){const id=randomBytes(12).toString('hex');ids.push(id);await db.collection('users').doc(id).set({role:'client',onboardingCompleted:false});return id;}
 it('commits profile and both forms once under concurrent requests',async()=>{
  const id=await user(),payload={heightCm:'170',weightKg:'65',allergies:['synthetic'],specificExclusions:{porkFree:true}};
  const results=await Promise.all([completeNativeOnboarding(db,id,payload),completeNativeOnboarding(db,id,payload)]);
  expect(results.filter(row=>!row.alreadyCompleted)).toHaveLength(1);
  expect((await db.collection('users').doc(id).get()).get('onboardingCompleted')).toBe(true);
  for(const collection of ['medicalinfos','lifestyleinfos'])expect((await db.collection(collection).where('userId','==',id).get()).size).toBe(1);
 });
 it('rejects invalid dates and never advances onboarding when forms are ambiguous',async()=>{
  const id=await user(),payload={heightCm:170,weightKg:65};
  await expect(completeNativeOnboarding(db,id,{...payload,dateOfBirth:'2999-01-01'})).rejects.toMatchObject({status:400});
  for(let i=0;i<2;i++)await db.collection('medicalinfos').doc(randomBytes(12).toString('hex')).set({userId:id});
  await expect(completeNativeOnboarding(db,id,payload)).rejects.toMatchObject({status:409});
  expect((await db.collection('users').doc(id).get()).get('onboardingCompleted')).toBe(false);
 });
});
