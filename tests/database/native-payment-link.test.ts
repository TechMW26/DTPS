import type * as MongoTypes from '@/lib/db/mongo-types';
import {randomBytes} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/database';
import {verifyNativePaymentLink} from '@/lib/db/repository/native-payment-link';
const suite=process.env.DTPS_MONGODB_LOCAL_TEST?describe:describe.skip;
suite('native payment link verification',()=>{
 let db:ReturnType<typeof getNativeDatabase>;const refs:MongoTypes.DocumentReference[]=[];
 beforeAll(()=>{db=getNativeDatabase();});afterAll(async()=>{for(const ref of refs)await ref.delete();await db.terminate();});
 const id=()=>randomBytes(12).toString('hex');
 async function setup(){const owner=id(),linkId='plink_'+id(),link=db.collection('paymentlinks').doc(id());refs.push(link);await link.set({client:owner,razorpayPaymentLinkId:linkId,amount:100,durationDays:30,status:'created'});return {owner,linkId,link,proof:{id:linkId,status:'paid',amount:10000,amount_paid:10000,currency:'INR'}};}
 it('rejects another owner, unpaid, partial or wrong-amount evidence without granting days',async()=>{
  const {owner,linkId,link,proof}=await setup(),fetch=jest.fn(async()=>proof);
  await expect(verifyNativePaymentLink(db,id(),linkId,fetch)).rejects.toMatchObject({status:404});expect(fetch).not.toHaveBeenCalled();
  for(const patch of [{status:'created'},{amount_paid:5000},{amount:20000,amount_paid:20000},{currency:'USD'}])await expect(verifyNativePaymentLink(db,owner,linkId,async()=>({...proof,...patch}))).rejects.toMatchObject({status:409});
  expect((await link.get()).get('status')).toBe('created');
  expect((await db.collection('unifiedpayments').where('razorpayPaymentLinkId','==',linkId).get()).empty).toBe(true);
 });
 it('grants one entitlement under concurrent retries and repairs source paid status',async()=>{
  const {owner,linkId,link,proof}=await setup();
  const results=await Promise.all([verifyNativePaymentLink(db,owner,linkId,async()=>proof),verifyNativePaymentLink(db,owner,linkId,async()=>proof)]);
  expect(results.filter(r=>r.created)).toHaveLength(1);const payment=results[0].payment;
  refs.push(db.collection('unifiedpayments').doc(payment._id),db.collection('_nativeRazorpayLinks').doc(linkId),db.collection('_nativeOutbox').doc('payment-paid-'+payment._id));
  expect(payment.remainingDays).toBe(30);expect(payment.endDate.getTime()-payment.startDate.getTime()).toBe(29*86400000);
  await link.update({status:'created'});await verifyNativePaymentLink(db,owner,linkId,async()=>proof);expect((await link.get()).get('status')).toBe('paid');
 });
});
