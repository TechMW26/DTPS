import {createHash,randomUUID} from 'node:crypto';
import {type Firestore,type DocumentData} from 'firebase-admin/firestore';
export type NativeDeliveryResult='sent'|'skipped'|'disabled';
export type NativeOutboxDelivery=(job:DocumentData)=>Promise<NativeDeliveryResult>;
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
/** Commit database-only effects atomically. A retry cannot duplicate an in-app receipt or provider job. */
export async function expandNativePaymentOutbox(db:Firestore,id:string){
 return db.runTransaction(async tx=>{
  const ref=db.collection('_nativeOutbox').doc(id),job=await tx.get(ref);
  if(!job.exists||job.get('status')!=='pending'||job.get('type')!=='payment-paid')return false;
  const paymentId=job.get('paymentId');if(typeof paymentId!=='string'||!/^[a-f0-9]{24}$/.test(paymentId))throw new Error('Invalid payment outbox reference');
  const payment=await tx.get(db.collection('unifiedpayments').doc(paymentId));
  if(!payment.exists||payment.get('client')!==job.get('clientId')||payment.get('paymentStatus')!=='paid'&&!['paid','completed'].includes(payment.get('status')))throw new Error('Payment outbox proof mismatch');
  const clientId=payment.get('client'),notificationId=hash('payment-paid\0'+paymentId).slice(0,24),now=new Date();
  const emailRef=db.collection('_nativeOutbox').doc('invoice-email-'+paymentId),pushRef=db.collection('_nativeOutbox').doc('payment-push-'+paymentId);
  const [email,push]=await tx.getAll(emailRef,pushRef);
  tx.set(db.collection('notifications').doc(notificationId),{_id:notificationId,userId:clientId,title:'Payment received',message:`Your payment for ${payment.get('planName')||'your plan'} was received.`,type:'payment',actionUrl:'/user/payments',data:{type:'payment_received',paymentId},read:false,createdAt:now,updatedAt:now});
  tx.set(db.collection('_nativeRealtimeEvents').doc(hash('payment-paid\0'+paymentId)),{targets:[`user:${clientId}`],event:'payment_updated',data:{paymentId,status:'paid'},createdAt:now,expiresAt:new Date(now.getTime()+300000)});
  if(!email.exists)tx.create(emailRef,{type:'invoice-email',paymentId,clientId,status:'pending',createdAt:now});
  if(!push.exists)tx.create(pushRef,{type:'payment-push',paymentId,clientId,status:'pending',createdAt:now});
  tx.update(ref,{status:'completed',completedAt:now});return true;
 });
}
export async function expandNativePaymentLinkOutbox(db:Firestore,id:string){
 return db.runTransaction(async tx=>{
  const ref=db.collection('_nativeOutbox').doc(id),job=await tx.get(ref);
  if(!job.exists||job.get('status')!=='pending'||job.get('type')!=='payment-link-created')return false;
  const paymentLinkId=job.get('paymentLinkId');if(typeof paymentLinkId!=='string'||!/^[a-f0-9]{24}$/.test(paymentLinkId))throw new Error('Invalid payment-link outbox reference');
  const link=await tx.get(db.collection('paymentlinks').doc(paymentLinkId));
  if(!link.exists||link.get('client')!==job.get('clientId')||link.get('_nativeProviderState')!=='ready')throw new Error('Payment-link outbox proof mismatch');
  if(!link.get('showToClient')||['paid','cancelled','expired'].includes(link.get('status'))){tx.update(ref,{status:'skipped',completedAt:new Date()});return true;}
  const clientId=job.get('clientId'),now=new Date(),notificationId=hash('payment-link-created\0'+paymentLinkId).slice(0,24);
  const pushRef=db.collection('_nativeOutbox').doc('payment-link-push-'+paymentLinkId),push=await tx.get(pushRef);
  tx.set(db.collection('notifications').doc(notificationId),{_id:notificationId,userId:clientId,title:'New payment request',message:`A payment has been requested for ${link.get('planName')||'your plan'}.`,type:'payment',actionUrl:'/user/payments',data:{type:'payment_link_created',paymentLinkId},read:false,createdAt:now,updatedAt:now});
  tx.set(db.collection('_nativeRealtimeEvents').doc(hash('payment-link-created\0'+paymentLinkId)),{targets:[`user:${clientId}`],event:'payment_link_updated',data:{paymentLinkId},createdAt:now,expiresAt:new Date(now.getTime()+300000)});
  if(!push.exists)tx.create(pushRef,{type:'payment-link-push',paymentLinkId,clientId,status:'pending',createdAt:now});
  tx.update(ref,{status:'completed',completedAt:now});return true;
 });
}
const appointmentTypes=['appointment-created','appointment-cancelled','appointment-rescheduled','appointment-completed'];
export async function expandNativeAppointmentOutbox(db:Firestore,id:string){
 return db.runTransaction(async tx=>{
  const ref=db.collection('_nativeOutbox').doc(id),job=await tx.get(ref);
  if(!job.exists||job.get('status')!=='pending'||!appointmentTypes.includes(job.get('type')))return false;
  const appointmentId=job.get('appointmentId');if(typeof appointmentId!=='string'||!/^[a-f0-9]{24}$/.test(appointmentId))throw new Error('Invalid appointment reference');
  const appointment=await tx.get(db.collection('appointments').doc(appointmentId));
  if(!appointment.exists||appointment.get('client')!==job.get('clientId')||appointment.get('dietitian')!==job.get('providerId'))throw new Error('Appointment outbox proof mismatch');
  const recipients=[...new Set([job.get('clientId'),job.get('providerId')])].filter(value=>value!==job.get('actorId'));
  const children=recipients.map(userId=>db.collection('_nativeOutbox').doc('appointment-push-'+hash(id+'\0'+userId)));
  const existing=children.length?await tx.getAll(...children):[];
  const calendarRefs=['dietitian','client'].map(role=>db.collection('_nativeOutbox').doc('appointment-calendar-'+hash(id+'\0'+role)));
  const calendarJobs=await tx.getAll(...calendarRefs);
  const now=new Date(),action=job.get('type').slice('appointment-'.length),title=`Appointment ${action}`;
  recipients.forEach((userId,index)=>{
   const notificationId=hash(id+'\0'+userId).slice(0,24),actionUrl=userId===job.get('clientId')?'/user/appointments':'/appointments';
   tx.set(db.collection('notifications').doc(notificationId),{_id:notificationId,userId,title,message:`Your appointment has been ${action}. Open appointments for the latest details.`,type:'appointment',actionUrl,data:{type:job.get('type'),appointmentId},read:false,createdAt:now,updatedAt:now});
   if(!existing[index].exists)tx.create(children[index],{type:'appointment-push',appointmentId,userId,clientId:job.get('clientId'),providerId:job.get('providerId'),action,title,actionUrl,status:'pending',createdAt:now});
  });
  if(action!=='completed')calendarRefs.forEach((child,index)=>{if(!calendarJobs[index].exists)tx.create(child,{type:'appointment-calendar',calendarRole:index===0?'dietitian':'client',appointmentId,clientId:job.get('clientId'),providerId:job.get('providerId'),status:'pending',createdAt:now});});
  tx.set(db.collection('_nativeRealtimeEvents').doc(hash(id)),{targets:[`user:${job.get('clientId')}`,`user:${job.get('providerId')}`],event:'appointment_updated',data:{appointmentId,action},createdAt:now,expiresAt:new Date(now.getTime()+300000)});
  tx.update(ref,{status:'completed',completedAt:now});return true;
 });
}
/** Only an unattempted pending effect can be claimed. Expired claims become uncertain, never automatic re-sends. */
export async function deliverNativeOutboxJob(db:Firestore,id:string,deliver:NativeOutboxDelivery){
 const ref=db.collection('_nativeOutbox').doc(id),owner=randomUUID(),now=new Date();
 const job=await db.runTransaction(async tx=>{
  const row=await tx.get(ref);if(!row.exists)return null;
  if(row.get('status')==='processing'&&row.get('leaseUntil')?.toMillis()<now.getTime()){
   tx.update(ref,{status:'uncertain',error:'Delivery lease expired; provider outcome requires review',updatedAt:now});return null;
  }
  if(row.get('status')!=='pending'||!['invoice-email','payment-push','payment-link-push','appointment-push','appointment-calendar'].includes(row.get('type')))return null;
  tx.update(ref,{status:'processing',owner,attemptedAt:now,leaseUntil:new Date(now.getTime()+120000)});return row.data()!;
 });
 if(!job)return 'skipped';
 let result:NativeDeliveryResult;
 try{result=await deliver(job);}catch{
  await db.runTransaction(async tx=>{const row=await tx.get(ref);if(row.get('owner')===owner&&row.get('status')==='processing')tx.update(ref,{status:'uncertain',error:'Provider outcome not confirmed; review before retry',updatedAt:new Date()});});
  return 'uncertain';
 }
 await db.runTransaction(async tx=>{
  const row=await tx.get(ref);if(row.get('owner')!==owner||row.get('status')!=='processing')return;
  // Disabled local delivery proves that no provider request occurred, so returning to pending is safe.
  tx.update(ref,{status:result==='disabled'?'pending':result==='sent'?'completed':'skipped',deliveryResult:result,updatedAt:new Date(),...(result==='sent'?{completedAt:new Date()}:{})});
 });
 return result;
}
export async function drainNativeOutbox(db:Firestore,deliver:NativeOutboxDelivery,limit=50){
 const rows=await db.collection('_nativeOutbox').where('status','in',['pending','processing']).where('type','in',['payment-paid','payment-link-created','invoice-email','payment-push','payment-link-push','appointment-push','appointment-calendar',...appointmentTypes]).orderBy('createdAt','asc').limit(Math.min(100,Math.max(1,limit))).get();
 const summary={selected:rows.size,expanded:0,sent:0,skipped:0,uncertain:0,disabled:0,failed:0};
 for(let offset=0;offset<rows.size;offset+=8)await Promise.all(rows.docs.slice(offset,offset+8).map(async row=>{
  try{
   if(appointmentTypes.includes(row.get('type'))){if(await expandNativeAppointmentOutbox(db,row.id))summary.expanded++;return;}
   if(row.get('type')==='payment-link-created'){if(await expandNativePaymentLinkOutbox(db,row.id))summary.expanded++;return;}
   if(row.get('type')==='payment-paid'){if(await expandNativePaymentOutbox(db,row.id))summary.expanded++;return;}
   const result=await deliverNativeOutboxJob(db,row.id,deliver);summary[result]++;
  }catch{summary.failed++;}
 }));return summary;
}
