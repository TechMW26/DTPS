import {randomBytes} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/database';
import {assignNativeClient} from '@/lib/db/repository/native-client-assignment';
import {changeNativeClientHold} from '@/lib/db/repository/native-client-hold';
import {updateNativeClientProfile} from '@/lib/db/repository/native-admin-client-profile';
import {listNativeAdminClients} from '@/lib/db/repository/native-client-directory';
const suite=process.env.DTPS_MONGODB_LOCAL_TEST?describe:describe.skip;
suite('native client administration',()=>{
 let db:ReturnType<typeof getNativeDatabase>;const refs:FirebaseFirestore.DocumentReference[]=[];
 async function seed(collection:string,data:Record<string,unknown>){const ref=db.collection(collection).doc(randomBytes(12).toString('hex'));refs.push(ref);await ref.set(data);return ref;}
 beforeAll(()=>{db=getNativeDatabase();});afterAll(async()=>{for(const ref of refs)await ref.delete();await db.terminate();});
 it('commits assignments and purchases together, rejects wrong staff roles, and clears stale primary payment assignments',async()=>{
  const admin=await seed('users',{role:'admin',status:'active'}),dt=await seed('users',{role:'dietitian',status:'active'}),client=await seed('users',{role:'client',status:'active'}),p=await seed('unifiedpayments',{client:client.id,status:'paid'});
  await assignNativeClient(db,admin.id,client.id,{action:'primary_secondary',primaryDietitianId:dt.id});expect((await p.get()).get('dietitian')).toBe(dt.id);
  await expect(assignNativeClient(db,admin.id,client.id,{dietitianId:admin.id})).rejects.toThrow();expect((await p.get()).get('dietitian')).toBe(dt.id);
  await assignNativeClient(db,admin.id,client.id,{action:'remove',dietitianId:dt.id});expect((await p.get()).get('dietitian')).toBeNull();
  await admin.update({role:'client'});await expect(assignNativeClient(db,admin.id,client.id,{dietitianId:dt.id})).rejects.toMatchObject({status:403});
 });
 it('resumes a hold exactly once, preserving the original end date and all purchased days',async()=>{
  const admin=await seed('users',{role:'admin',status:'active'}),client=await seed('users',{role:'client',status:'active'}),start=new Date('2099-01-01T00:00:00Z'),end=new Date('2099-02-01T00:00:00Z');
  const p=await seed('unifiedpayments',{client:client.id,paymentStatus:'paid',status:'paid',expectedStartDate:start,expectedEndDate:end,daysUsed:10,totalDays:90});
  await changeNativeClientHold(db,admin.id,client.id,true,'',new Date('2099-01-05T00:00:00Z'));
  const results=await Promise.allSettled([changeNativeClientHold(db,admin.id,client.id,false,'',new Date('2099-01-07T00:00:00Z')),changeNativeClientHold(db,admin.id,client.id,false,'',new Date('2099-01-07T00:00:00Z'))]);
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);const payment=(await p.get()).data()!;expect(payment.expectedEndDate.toDate()).toEqual(new Date('2099-02-03T00:00:00Z'));expect(payment.originalExpectedEndDate.toDate()).toEqual(end);expect(payment.daysUsed).toBe(10);expect(payment.holdExtensionHistory).toHaveLength(1);
 });
 it('does not extend unused purchases, and rejects unassigned staff edits',async()=>{
  const admin=await seed('users',{role:'admin',status:'active'}),dt=await seed('users',{role:'dietitian',status:'active'}),client=await seed('users',{role:'client',status:'active',allergies:['Keep']});const p=await seed('unifiedpayments',{client:client.id,paymentStatus:'paid',status:'paid',endDate:new Date('2099-03-01'),daysUsed:0});
  await expect(changeNativeClientHold(db,dt.id,client.id,true)).rejects.toMatchObject({status:403});
  await updateNativeClientProfile(db,admin.id,client.id,{firstName:'Synthetic',role:'admin',password:'no',_nativeExternalFields:[]});const saved=(await client.get()).data()!;expect(saved.role).toBe('client');expect(saved.password).toBeUndefined();expect(saved.allergies).toEqual(['Keep']);
  await changeNativeClientHold(db,admin.id,client.id,true,'',new Date('2099-01-05'));await changeNativeClientHold(db,admin.id,client.id,false,'',new Date('2099-01-07'));expect((await p.get()).get('holdExtensionMs')).toBeUndefined();
 });
 it('filters missing assignments and pending onboarding without exposing credentials',async()=>{
  const marker='Synthetic-'+randomBytes(6).toString('hex');const client=await seed('users',{role:'client',status:'active',firstName:marker,lastName:'Directory',createdAt:new Date(),password:'never-return',fcmTokens:['secret']});
  const result=await listNativeAdminClients(db,new URLSearchParams({search:marker,assigned:'false',onboarding:'pending',status:'lead'}));expect(result.clients).toHaveLength(1);expect(result.clients[0]._id).toBe(client.id);expect(result.clients[0].password).toBeUndefined();expect(result.clients[0].fcmTokens).toBeUndefined();
 });
});
