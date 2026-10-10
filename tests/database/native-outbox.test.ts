import {randomBytes,createHash} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/database';
import {expandNativePaymentOutbox,expandNativeAppointmentOutbox,deliverNativeOutboxJob} from '@/lib/db/repository/native-outbox';
const suite=process.env.DTPS_MONGODB_LOCAL_TEST?describe:describe.skip;
suite('native payment effect outbox',()=>{
 let db:ReturnType<typeof getNativeDatabase>;const refs:FirebaseFirestore.DocumentReference[]=[];
 beforeAll(()=>{db=getNativeDatabase();});afterAll(async()=>{for(const ref of refs)await ref.delete();await db.terminate();});
 it('expands a paid purchase exactly once under concurrent retries',async()=>{
  const id=randomBytes(12).toString('hex'),client=randomBytes(12).toString('hex'),payment=db.collection('unifiedpayments').doc(id),job=db.collection('_nativeOutbox').doc('payment-paid-'+id);
  const digest=createHash('sha256').update('payment-paid\0'+id).digest('hex');
  refs.push(payment,job,db.collection('notifications').doc(digest.slice(0,24)),db.collection('_nativeRealtimeEvents').doc(digest),db.collection('_nativeOutbox').doc('invoice-email-'+id),db.collection('_nativeOutbox').doc('payment-push-'+id));
  await payment.set({client,paymentStatus:'paid',planName:'Synthetic'});await job.set({type:'payment-paid',paymentId:id,clientId:client,status:'pending',createdAt:new Date()});
  const result=await Promise.all([expandNativePaymentOutbox(db,job.id),expandNativePaymentOutbox(db,job.id)]);
  expect(result.filter(Boolean)).toHaveLength(1);expect((await job.get()).get('status')).toBe('completed');
  await refs[2].update({read:true});await expandNativePaymentOutbox(db,job.id);expect((await refs[2].get()).get('read')).toBe(true);
 });
 it('claims external delivery once and keeps ambiguous outcomes out of automatic retries',async()=>{
  const ref=db.collection('_nativeOutbox').doc('synthetic-'+randomBytes(12).toString('hex'));refs.push(ref);
  await ref.set({type:'invoice-email',status:'pending',createdAt:new Date()});
  const deliver=jest.fn(async()=>{throw new Error('Synthetic network loss');});
  await Promise.all([deliverNativeOutboxJob(db,ref.id,deliver),deliverNativeOutboxJob(db,ref.id,deliver)]);
  await deliverNativeOutboxJob(db,ref.id,deliver);
  expect(deliver).toHaveBeenCalledTimes(1);expect((await ref.get()).get('status')).toBe('uncertain');
 });
 it('does not resend an expired in-flight effect',async()=>{
  const ref=db.collection('_nativeOutbox').doc('synthetic-'+randomBytes(12).toString('hex'));refs.push(ref);
  await ref.set({type:'invoice-email',status:'processing',leaseUntil:new Date(Date.now()-1000),createdAt:new Date()});
  const deliver=jest.fn(async()=> 'sent' as const);await deliverNativeOutboxJob(db,ref.id,deliver);
  expect(deliver).not.toHaveBeenCalled();expect((await ref.get()).get('status')).toBe('uncertain');
 });
 it('expands appointment effects once without contacting providers',async()=>{
  const id=randomBytes(12).toString('hex'),client=randomBytes(12).toString('hex'),provider=randomBytes(12).toString('hex'),job=db.collection('_nativeOutbox').doc('appointment-'+id),appointment=db.collection('appointments').doc(id);
  const digest=createHash('sha256').update(job.id+'\0'+client).digest('hex');
  refs.push(job,appointment,db.collection('notifications').doc(digest.slice(0,24)),db.collection('_nativeOutbox').doc('appointment-push-'+digest),db.collection('_nativeRealtimeEvents').doc(createHash('sha256').update(job.id).digest('hex')));
  await appointment.set({client,dietitian:provider});await job.set({type:'appointment-created',appointmentId:id,clientId:client,providerId:provider,actorId:provider,status:'pending',createdAt:new Date()});
  for(const role of ['dietitian','client'])refs.push(db.collection('_nativeOutbox').doc('appointment-calendar-'+createHash('sha256').update(job.id+'\0'+role).digest('hex')));
  const results=await Promise.all([expandNativeAppointmentOutbox(db,job.id),expandNativeAppointmentOutbox(db,job.id)]);
  expect(results.filter(Boolean)).toHaveLength(1);expect((await db.collection('_nativeOutbox').doc('appointment-push-'+digest).get()).get('status')).toBe('pending');
 });

});
