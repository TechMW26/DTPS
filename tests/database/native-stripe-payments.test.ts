import type * as MongoTypes from '@/lib/db/mongo-types';
import {randomBytes} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/database';
import {createNativeStripeConsultation,settleNativeStripePayment} from '@/lib/db/repository/native-stripe-payments';
const suite=process.env.DTPS_MONGODB_LOCAL_TEST?describe:describe.skip;
suite('native Stripe verification',()=>{
 let db:ReturnType<typeof getNativeDatabase>;const refs:MongoTypes.DocumentReference[]=[];const id=()=>randomBytes(12).toString('hex');
 const add=async(c:string,i:string,data:any)=>{const ref=db.collection(c).doc(i);refs.push(ref);await ref.set(data);return ref;};
 beforeAll(()=>{db=getNativeDatabase();});afterAll(async()=>{for(const ref of refs)await ref.delete();await db.terminate();});
 it('uses authoritative appointment pricing and settles verified payment once',async()=>{
  const user=id(),staff=id(),appointment=id(),intent='pi_'+id();await add('users',user,{role:'client',status:'active'});await add('users',staff,{role:'dietitian',status:'active',consultationFee:50,consultationCurrency:'USD'});await add('appointments',appointment,{client:user,dietitian:staff,status:'scheduled'});
  const provider={create:jest.fn(async(data:any)=>({...data,id:intent,status:'requires_payment_method',client_secret:'test'})),retrieve:jest.fn()};
  await expect(createNativeStripeConsultation(db,user,{appointmentId:appointment,amount:1,currency:'USD'},id(),provider)).rejects.toMatchObject({status:409});
  const result=await createNativeStripeConsultation(db,user,{appointmentId:appointment,amount:50,currency:'USD'},id(),provider);refs.push(db.collection('unifiedpayments').doc(result.payment._id),db.collection('_nativeStripePayments').doc(intent),db.collection('_nativeOutbox').doc('payment-paid-'+result.payment._id));
  const proof={id:intent,amount:5000,amount_received:5000,currency:'usd',status:'succeeded'};
  await expect(settleNativeStripePayment(db,{...proof,amount:1},user)).rejects.toMatchObject({status:409});await expect(settleNativeStripePayment(db,proof,id())).rejects.toMatchObject({status:403});
  const settled=await Promise.all([settleNativeStripePayment(db,proof,user),settleNativeStripePayment(db,proof,user)]);expect(settled.every(row=>row.paymentStatus==='paid')).toBe(true);expect(settled[0].durationDays).toBe(0);
  await settleNativeStripePayment(db,{...proof,status:'canceled'});expect((await db.collection('unifiedpayments').doc(result.payment._id).get()).get('paymentStatus')).toBe('paid');
 });
});
