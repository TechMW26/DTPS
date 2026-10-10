import {nativeResponseJson} from '@/lib/api/native-response';
import {deliverNativeAppointmentCalendar} from '@/lib/services/native-appointment-calendar';
import {NextRequest,NextResponse} from 'next/server';
import {getNativeDatabase} from '@/lib/db/database';
import {drainNativeOutbox} from '@/lib/db/repository/native-outbox';
import {deliverNativePaymentInvoice} from '@/lib/services/invoiceSender';
import {sendNotificationToUser} from '@/lib/firebase/firebaseNotification';
export const runtime='nodejs';export const maxDuration=60;
export async function GET(request:NextRequest){
 const secret=process.env.CRON_SECRET;if(!secret||request.headers.get('authorization')!==`Bearer ${secret}`)return nativeResponseJson({error:'Unauthorized'},{status:401});
 // A local browser or test must not consume the production delivery queue or send to real people.
 if(process.env.NODE_ENV!=='production')return nativeResponseJson({success:true,skipped:'local_delivery_disabled'});
 try{
  const db=getNativeDatabase();
  const summary=await drainNativeOutbox(db,async job=>{
   if(job.type==='appointment-calendar')return deliverNativeAppointmentCalendar(job);
   if(job.type==='appointment-push'){
    const appointment=await db.collection('appointments').doc(job.appointmentId).get();
    if(!appointment.exists||appointment.get('client')!==job.clientId||appointment.get('dietitian')!==job.providerId)throw new Error('Appointment proof changed');
    if(job.action!=='cancelled'&&appointment.get('status')==='cancelled')return 'skipped';
    const result=await sendNotificationToUser(job.userId,{title:job.title,body:`Your appointment has been ${job.action}. Open appointments for the latest details.`,clickAction:job.actionUrl,saveToDb:false,data:{type:'appointment_'+job.action,appointmentId:job.appointmentId,tag:'appointment-'+job.appointmentId}});
    if(result.successCount>0)return 'sent';
    if(result.errorCode==='NO_TOKEN'||result.errorCode==='CLIENT_ON_HOLD')return 'skipped';
    throw new Error('Push provider outcome not confirmed');
   }
   if(job.type==='invoice-email')return deliverNativePaymentInvoice(job.paymentId);
   if(job.type==='payment-link-push'){
    const link=await db.collection('paymentlinks').doc(job.paymentLinkId).get();
    if(!link.exists||link.get('client')!==job.clientId)throw new Error('Payment link proof changed');
    if(!link.get('showToClient')||['paid','cancelled','expired'].includes(link.get('status')))return 'skipped';
    const result=await sendNotificationToUser(job.clientId,{title:'New payment request',body:`A payment has been requested for ${link.get('planName')||'your plan'}.`,clickAction:'/user/payments',saveToDb:false,data:{type:'payment_link_created',paymentLinkId:job.paymentLinkId,tag:'payment-link-'+job.paymentLinkId}});
    if(result.successCount>0)return 'sent';
    if(result.errorCode==='NO_TOKEN'||result.errorCode==='CLIENT_ON_HOLD')return 'skipped';
    throw new Error('Push provider outcome not confirmed');
   }
   const row=await db.collection('unifiedpayments').doc(job.paymentId).get();
   if(!row.exists||row.get('client')!==job.clientId||(row.get('paymentStatus')!=='paid'&&!['paid','completed'].includes(row.get('status'))))throw new Error('Payment proof changed');
   const result=await sendNotificationToUser(job.clientId,{title:'Payment received',body:`Your payment for ${row.get('planName')||'your plan'} was received.`,clickAction:'/user/payments',saveToDb:false,data:{type:'payment_received',paymentId:job.paymentId,tag:'payment-paid-'+job.paymentId}});
   if(result.successCount>0)return 'sent';
   if(result.errorCode==='NO_TOKEN'||result.errorCode==='CLIENT_ON_HOLD')return 'skipped';
   throw new Error('Push provider outcome not confirmed');
  });
  return nativeResponseJson({success:true,summary});
 }catch{return nativeResponseJson({error:'Notification outbox failed'},{status:503});}
}
