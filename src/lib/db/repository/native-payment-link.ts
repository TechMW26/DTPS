import {createHash} from 'node:crypto';
import {Filter,type MongoDatabase,type DocumentData,type Transaction} from '@/lib/db/mongo-types';
import {NativeCheckoutError} from './native-checkout';
import {nativeDates} from './native-plan-editor';
import {nativeHabitDay} from './native-habits';
export async function verifyNativePaymentLink(db:MongoDatabase,userId:string,linkId:unknown,fetchLink:(id:string)=>Promise<DocumentData>,authorize?:(tx:Transaction)=>Promise<unknown>){
 if(typeof linkId!=='string'||!/^plink_[a-zA-Z0-9]+$/.test(linkId))throw new NativeCheckoutError('Invalid payment link ID',400);
 const owned=await db.collection('unifiedpayments').where('razorpayPaymentLinkId','==',linkId).where('client','==',userId).limit(1).get();
 const links=await db.collection('paymentlinks').where('razorpayPaymentLinkId','==',linkId).where('client','==',userId).limit(2).get();
 if(owned.empty&&links.empty||links.size>1)throw new NativeCheckoutError('Payment link not found or ambiguous',404);
 const proof=await fetchLink(linkId);
 if(proof.id!==linkId||proof.status!=='paid'||!Number.isFinite(Number(proof.amount))||Number(proof.amount_paid)<Number(proof.amount))throw new NativeCheckoutError('Payment link has not been fully paid',409);
 return db.runTransaction(async tx=>{
  if(authorize)await authorize(tx);
  const linkRows=await tx.get(db.collection('paymentlinks').where('razorpayPaymentLinkId','==',linkId).limit(2));
  if(linkRows.size>1||linkRows.docs.some(row=>row.get('client')!==userId))throw new NativeCheckoutError('Payment link ownership conflict',409);
  const link=linkRows.docs[0],query=db.collection('unifiedpayments').where(link?Filter.or(Filter.where('razorpayPaymentLinkId','==',linkId),Filter.where('paymentLink','==',link.id)):Filter.where('razorpayPaymentLinkId','==',linkId));
  const payments=await tx.get(query.limit(2));if(payments.size>1||payments.docs.some(row=>row.get('client')!==userId))throw new NativeCheckoutError('Payment records require reconciliation',409);
  const existing=payments.docs[0];if(!existing&&!link)throw new NativeCheckoutError('Payment record not found',404);
  const raw=nativeDates((existing||link).data()!),amount=Number(raw.finalAmount??raw.amount??raw.baseAmount),currency=raw.currency||'INR';
  if(!Number.isFinite(amount)||Math.round(amount*100)!==Number(proof.amount)||proof.currency!==currency)throw new NativeCheckoutError('Payment link amount or currency mismatch',409);
  const ref=existing?.ref||db.collection('unifiedpayments').doc(createHash('sha256').update('razorpay-link\0'+linkId).digest('hex').slice(0,24));
  if(!existing&&(await tx.get(ref)).exists)throw new NativeCheckoutError('Payment identity conflict',409);
  const claim=db.collection('_nativeRazorpayLinks').doc(linkId),claimed=await tx.get(claim);if(claimed.exists&&claimed.get('paymentRecordId')!==ref.id)throw new NativeCheckoutError('Payment link already allocated',409);
  const captured=Array.isArray(proof.payments)?proof.payments.filter((payment:DocumentData)=>payment.status==='captured'&&typeof payment.payment_id==='string'&&/^pay_[a-zA-Z0-9]+$/.test(payment.payment_id)):[];
  const capturedIds=[...new Set<string>(captured.map((payment:DocumentData)=>payment.payment_id))];
  if(capturedIds.length>30)throw new NativeCheckoutError('Split payment requires reconciliation',409);
  const paymentClaims=capturedIds.length?await tx.getAll(...capturedIds.map(id=>db.collection('_nativeRazorpayPayments').doc(id))):[];
  const subscriptionLink=await tx.get(db.collection('clientsubscriptions').where('razorpayPaymentLinkId','==',linkId).limit(1));const subscriptionPayments=capturedIds.length?await tx.get(db.collection('clientsubscriptions').where('razorpayPaymentId','in',capturedIds).limit(1)):null;if(!subscriptionLink.empty||subscriptionPayments&&!subscriptionPayments.empty)throw new NativeCheckoutError('Provider funds already belong to a subscription',409);
  const paymentMatches=capturedIds.length?await tx.get(db.collection('unifiedpayments').where('razorpayPaymentId','in',capturedIds).limit(31)):null;
  if(paymentClaims.some(doc=>doc.exists&&doc.get('paymentRecordId')!==ref.id)||paymentMatches?.docs.some(doc=>doc.id!==ref.id))throw new NativeCheckoutError('Captured payment already allocated',409);
  const proofPatch:DocumentData=capturedIds.length===1?{razorpayPaymentId:capturedIds[0],transactionId:capturedIds[0]}:{};
  if(existing?.get('paymentStatus')==='paid'){
   if(link && link.get('status')!=='paid')tx.update(link.ref,{status:'paid',paidAt:raw.paidAt||new Date(),updatedAt:new Date()});
   if(capturedIds.length===1&&!raw.razorpayPaymentId)tx.update(ref,proofPatch);
   for(const paymentClaim of paymentClaims)if(!paymentClaim.exists)tx.set(paymentClaim.ref,{paymentRecordId:ref.id,client:userId,verifiedAt:new Date()});
   if(!claimed.exists)tx.set(claim,{paymentRecordId:ref.id,client:userId,verifiedAt:new Date()});
   return {created:false,payment:{...raw,_id:ref.id}};
  }
  const duration=Number(raw.durationDays);if(!Number.isSafeInteger(duration)||duration<=0)throw new NativeCheckoutError('Plan duration requires review',409);
  const now=new Date(),start=raw.startDate||new Date(nativeHabitDay(null).start.getTime()+86400000),end=raw.endDate||new Date(start.getTime()+(duration-1)*86400000);
  const patch:DocumentData={...proofPatch,client:userId,status:'paid',paymentStatus:'paid',razorpayPaymentLinkId:linkId,paidAt:raw.paidAt||now,startDate:start,endDate:end,expectedStartDate:raw.expectedStartDate||start,expectedEndDate:raw.expectedEndDate||end,remainingDays:Math.max(0,duration-Number(raw.daysUsed||0)),updatedAt:now};
  if(existing)tx.update(ref,patch);
  else tx.create(ref,{_id:ref.id,dietitian:raw.dietitian||null,servicePlan:raw.servicePlanId||raw.servicePlan||null,paymentLink:link.id,paymentType:'service_plan',planName:raw.planName||'Diet Plan',planCategory:raw.planCategory||'general-wellness',durationDays:duration,durationLabel:raw.durationLabel||raw.duration||`${duration} Days`,baseAmount:raw.amount,finalAmount:amount,amount,currency,paymentMethod:'razorpay',daysUsed:0,mealPlanCreated:false,createdAt:now,...patch});
  if(link)tx.update(link.ref,{status:'paid',paidAt:raw.paidAt||now,updatedAt:now});
  for(const paymentClaim of paymentClaims)tx.set(paymentClaim.ref,{paymentRecordId:ref.id,client:userId,verifiedAt:now});
  tx.set(claim,{paymentRecordId:ref.id,client:userId,verifiedAt:now});tx.set(db.collection('_nativeOutbox').doc('payment-paid-'+ref.id),{type:'payment-paid',paymentId:ref.id,clientId:userId,status:'pending',createdAt:now});
  return {created:true,payment:{...raw,...patch,_id:ref.id}};
 });
}
