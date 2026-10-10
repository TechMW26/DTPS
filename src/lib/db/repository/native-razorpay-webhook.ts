import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import type {MongoDatabase,DocumentData} from '@/lib/db/mongo-types';
import {NativeCheckoutError,settleNativeCapturedPayment} from './native-checkout';
import {verifyNativePaymentLink} from './native-payment-link';
export function validNativeWebhookSignature(body:string,signature:string,secret:string){return !!secret&&/^[a-f\d]{64}$/i.test(signature)&&timingSafeEqual(createHmac('sha256',secret).update(body).digest(),Buffer.from(signature,'hex'));}
export async function processNativeRazorpayWebhook(db:MongoDatabase,event:DocumentData,eventHash:string,fetchLink:(id:string)=>Promise<DocumentData>){
 const receipt=db.collection('_nativeWebhookEvents').doc('razorpay-'+eventHash),seen=await receipt.get();if(seen.get('status')==='processed')return {duplicate:true};
 const type=event.event,payment=event.payload?.payment?.entity,link=event.payload?.payment_link?.entity;
 if(type==='payment_link.paid'||type==='payment.link.completed'){
  if(!link?.id||!/^plink_[a-zA-Z0-9]+$/.test(link.id))throw new NativeCheckoutError('Invalid webhook link',400);
  const rows=await db.collection('paymentlinks').where('razorpayPaymentLinkId','==',link.id).limit(2).get();if(rows.size!==1)throw new NativeCheckoutError('Payment link not found or ambiguous',409);
  await verifyNativePaymentLink(db,rows.docs[0].get('client'),link.id,async()=>link);
 }else if(type==='payment.captured'){
  if(!payment?.id||payment.status!=='captured'||payment.captured!==true)throw new NativeCheckoutError('Invalid captured payment',400);
  const rows=payment.order_id?await db.collection('unifiedpayments').where('razorpayOrderId','==',payment.order_id).limit(2).get():null;
  if(rows?.size===1)await settleNativeCapturedPayment(db,rows.docs[0].get('client'),payment);
  else{
   const nativeId=payment.notes?.paymentLinkId,providerId=payment.notes?.razorpayPaymentLinkId;
   const source=typeof nativeId==='string'&&/^[a-f\d]{24}$/i.test(nativeId)?await db.collection('paymentlinks').doc(nativeId).get():null;
   const linkId=source?.get('razorpayPaymentLinkId')||providerId;
   if(typeof linkId!=='string'||!/^plink_[a-zA-Z0-9]+$/.test(linkId))throw new NativeCheckoutError('Captured payment requires reconciliation',409);
   const links=await db.collection('paymentlinks').where('razorpayPaymentLinkId','==',linkId).limit(2).get();if(links.size!==1)throw new NativeCheckoutError('Payment link is ambiguous',409);
   await verifyNativePaymentLink(db,links.docs[0].get('client'),linkId,fetchLink);
  }
 }else if(['payment_link.expired','payment_link.cancelled','payment.link.cancelled'].includes(type)){
  if(!link?.id||!/^plink_[a-zA-Z0-9]+$/.test(link.id))throw new NativeCheckoutError('Invalid webhook link',400);
  const next=type.includes('expired')?'expired':'cancelled';if(link.status!==next)throw new NativeCheckoutError('Webhook status mismatch',400);
  await db.runTransaction(async tx=>{const rows=await tx.get(db.collection('paymentlinks').where('razorpayPaymentLinkId','==',link.id).limit(2));if(rows.size!==1)throw new NativeCheckoutError('Payment link not found or ambiguous',409);const row=rows.docs[0];if(row.get('status')!=='paid')tx.update(row.ref,{status:next,updatedAt:new Date()});});
 }else if(type==='payment.failed'){
  if(!payment?.order_id)throw new NativeCheckoutError('Invalid payment failure',400);
  await db.runTransaction(async tx=>{const rows=await tx.get(db.collection('unifiedpayments').where('razorpayOrderId','==',payment.order_id).limit(2));if(rows.size>1)throw new NativeCheckoutError('Payment is ambiguous',409);const row=rows.docs[0];if(row&&row.get('paymentStatus')!=='paid')tx.update(row.ref,{status:'failed',paymentStatus:'failed',updatedAt:new Date()});});
 }
 // Authorization is not capture; it must never grant service days.
 await receipt.set({provider:'razorpay',type:String(type||'unknown'),status:'processed',processedAt:new Date(),payloadHash:eventHash});return {duplicate:false};
}
export const nativeWebhookHash=(body:string)=>createHash('sha256').update(body).digest('hex');
