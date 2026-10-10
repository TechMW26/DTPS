import type * as MongoTypes from '@/lib/db/mongo-types';
import {randomBytes} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/database';
import {nativePurchaseEligibility} from '@/lib/db/repository/native-purchase-eligibility';
const suite=process.env.DTPS_MONGODB_LOCAL_TEST?describe:describe.skip;
suite('native purchase eligibility',()=>{
 let db:ReturnType<typeof getNativeDatabase>;const refs:MongoTypes.DocumentReference[]=[];const id=()=>randomBytes(12).toString('hex');
 const add=async(collection:string,id:string,data:any)=>{const ref=db.collection(collection).doc(id);refs.push(ref);await ref.set(data);return ref;};
 beforeAll(()=>{db=getNativeDatabase();});afterAll(async()=>{for(const ref of refs)await ref.delete();await db.terminate();});
 it('preserves a three-month entitlement independently of a ten-day phase without read-time writes',async()=>{
  const actor=id(),client=id(),purchase=id();await add('users',actor,{role:'admin',status:'active'});await add('users',client,{role:'client',status:'active'});
  const ref=await add('unifiedpayments',purchase,{client,planName:'Three months',durationDays:90,daysUsed:10,paymentStatus:'paid',status:'paid',createdAt:new Date('2026-01-01'),expectedStartDate:new Date('2026-01-01'),expectedEndDate:new Date('2026-01-10')});
  await add('clientmealplans',id(),{clientId:client,purchaseId:purchase,status:'active',duration:10,startDate:new Date('2026-01-01'),endDate:new Date('2026-01-10')});
  const before=(await ref.get()).updateTime;
  const result=await nativePurchaseEligibility(db,actor,client,10,true);
  expect(result).toMatchObject({hasPaidPlan:true,canCreateMealPlan:true,totalPurchasedDays:90,totalDaysUsed:10,remainingDays:80});expect((await ref.get()).updateTime?.isEqual(before!)).toBe(true);
  expect((await nativePurchaseEligibility(db,actor,client,10,false)).canCreateMealPlan).toBe(false);
 });
 it('ignores deleted phases and rejects unrelated clients',async()=>{
  const client=id(),other=id(),purchase=id();await add('users',client,{role:'client',status:'active'});await add('users',other,{role:'client',status:'active'});
  await add('unifiedpayments',purchase,{client,durationDays:30,paymentStatus:'paid',createdAt:new Date('2026-01-01'),mealPlanCreated:true});
  await add('clientmealplans',id(),{clientId:client,purchaseId:purchase,status:'active',duration:10,isDeleted:true});
  expect((await nativePurchaseEligibility(db,client,client,0,false)).remainingDays).toBe(30);
  await expect(nativePurchaseEligibility(db,other,client,0,false)).rejects.toMatchObject({status:403});
 });
});
