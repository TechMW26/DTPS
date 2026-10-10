import type * as MongoTypes from '@/lib/db/mongo-types';
import {randomBytes} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/database';
import {createNativeOtherPayment,reviewNativeOtherPayment,deleteNativeOtherPayment} from '@/lib/db/repository/native-other-payments';
const suite=process.env.DTPS_MONGODB_LOCAL_TEST?describe:describe.skip;
suite('native manual payment approval',()=>{
 let db:ReturnType<typeof getNativeDatabase>;const refs:MongoTypes.DocumentReference[]=[];const id=()=>randomBytes(12).toString('hex');
 const add=async(collection:string,id:string,data:any)=>{const ref=db.collection(collection).doc(id);refs.push(ref);await ref.set(data);return ref;};
 beforeAll(()=>{db=getNativeDatabase();});afterAll(async()=>{for(const ref of refs)await ref.delete();await db.terminate();});
 it('atomically approves and grants one entitlement across concurrent retries',async()=>{
  const actor=id(),client=id(),transaction=id(),link=id();await add('users',actor,{role:'admin',status:'active'});await add('users',client,{role:'client',status:'active'});
  await add('paymentlinks',link,{client,status:'pending',finalAmount:15000,amount:15000,planName:'3 months',durationDays:90});
  const data={clientId:client,platform:'bank_transfer',transactionId:transaction,amount:15000,paymentLinkId:link,durationDays:1};
  const [a,b]=await Promise.all([createNativeOtherPayment(db,actor,data),createNativeOtherPayment(db,actor,data)]);expect(a._id).toBe(b._id);expect(a.durationDays).toBe(90);refs.push(db.collection('otherplatformpayments').doc(a._id));
  await expect(reviewNativeOtherPayment(db,client,a._id,{status:'approved'})).rejects.toMatchObject({status:403});
  await Promise.all([reviewNativeOtherPayment(db,actor,a._id,{status:'approved'}),reviewNativeOtherPayment(db,actor,a._id,{status:'approved'})]);
  const payments=await db.collection('unifiedpayments').where('otherPlatformPayment','==',a._id).get();expect(payments.size).toBe(1);expect(payments.docs[0].data()).toMatchObject({durationDays:90,remainingDays:90,daysUsed:0,paymentStatus:'paid'});
  refs.push(payments.docs[0].ref,db.collection('_nativeOutbox').doc('payment-paid-'+payments.docs[0].id));
  await expect(deleteNativeOtherPayment(db,actor,a._id)).rejects.toMatchObject({status:409});
 });
 it('rejects tampered link price before granting any allocation',async()=>{
  const actor=id(),client=id(),link=id();await add('users',actor,{role:'admin',status:'active'});await add('users',client,{role:'client',status:'active'});await add('paymentlinks',link,{client,status:'pending',finalAmount:15000,durationDays:90});
  await expect(createNativeOtherPayment(db,actor,{clientId:client,platform:'upi',transactionId:id(),amount:1,paymentLinkId:link,durationDays:90})).rejects.toMatchObject({status:409});
 });
});
