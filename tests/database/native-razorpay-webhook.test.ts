import {randomBytes,createHmac} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/database';
import {processNativeRazorpayWebhook,validNativeWebhookSignature} from '@/lib/db/repository/native-razorpay-webhook';
const suite=process.env.DTPS_MONGODB_LOCAL_TEST?describe:describe.skip;
suite('native Razorpay webhook',()=>{
 let db:ReturnType<typeof getNativeDatabase>;const refs:FirebaseFirestore.DocumentReference[]=[];const id=()=>randomBytes(12).toString('hex');
 beforeAll(()=>{db=getNativeDatabase();});afterAll(async()=>{for(const ref of refs)await ref.delete();await db.terminate();});
 it('requires correct signature bytes',()=>{const body='{"event":"test"}',signature=createHmac('sha256','secret').update(body).digest('hex');expect(validNativeWebhookSignature(body,signature,'secret')).toBe(true);expect(validNativeWebhookSignature(body+' ',signature,'secret')).toBe(false);expect(validNativeWebhookSignature(body,'not-hex','secret')).toBe(false);});
 it('does not grant for authorization and settles captured payment once',async()=>{
  const client=id(),order='order_'+id(),payment='pay_'+id(),record=db.collection('unifiedpayments').doc(id());refs.push(record);await record.set({client,razorpayOrderId:order,finalAmount:500,currency:'INR',durationDays:30,status:'pending',paymentStatus:'pending',daysUsed:0});
  const authorizedHash=id();refs.push(db.collection('_nativeWebhookEvents').doc('razorpay-'+authorizedHash));await processNativeRazorpayWebhook(db,{event:'payment.authorized',payload:{payment:{entity:{id:payment,order_id:order,status:'authorized'}}}},authorizedHash,jest.fn());expect((await record.get()).get('paymentStatus')).toBe('pending');
  const event={event:'payment.captured',payload:{payment:{entity:{id:payment,order_id:order,status:'captured',captured:true,amount:50000,currency:'INR'}}}},hash=id();refs.push(db.collection('_nativeWebhookEvents').doc('razorpay-'+hash),db.collection('_nativeRazorpayPayments').doc(payment),db.collection('_nativeOutbox').doc('payment-paid-'+record.id));
  await Promise.all([processNativeRazorpayWebhook(db,event,hash,jest.fn()),processNativeRazorpayWebhook(db,event,hash,jest.fn())]);expect((await record.get()).data()).toMatchObject({paymentStatus:'paid',remainingDays:30,daysUsed:0});expect((await processNativeRazorpayWebhook(db,event,hash,jest.fn())).duplicate).toBe(true);
  const failedHash=id();refs.push(db.collection('_nativeWebhookEvents').doc('razorpay-'+failedHash));await processNativeRazorpayWebhook(db,{event:'payment.failed',payload:event.payload},failedHash,jest.fn());expect((await record.get()).get('paymentStatus')).toBe('paid');
 });
});
