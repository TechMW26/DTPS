import type * as MongoTypes from '@/lib/db/mongo-types';
import {createHash,randomBytes,createHmac,timingSafeEqual} from 'node:crypto';
import type {MongoDatabase,DocumentData} from '@/lib/db/mongo-types';
import {nativeDates} from './native-plan-editor';
import {nativeHabitDay} from './native-habits';
export class NativeCheckoutError extends Error{constructor(message:string,public status:number){super(message);}}
export interface CheckoutProvider{createOrder(data:DocumentData):Promise<DocumentData>;findOrders(receipt:string):Promise<DocumentData[]>;fetchPayment(id:string):Promise<DocumentData>}
const clean=(data:DocumentData)=>Object.fromEntries(Object.entries(data).filter(([,value])=>value!==undefined));
export async function createNativeCheckout(db:MongoDatabase,userId:string,kind:'service_plan'|'subscription',input:DocumentData,key:string|null,provider:CheckoutProvider){
 if(typeof input.planId!=='string'||!/^[a-f0-9]{24}$/.test(input.planId))throw new NativeCheckoutError('A valid plan is required',400);
 const operation=key&&/^[a-zA-Z0-9._:-]{8,128}$/.test(key)?key:randomBytes(16).toString('hex');
 const id=createHash('sha256').update([userId,kind,operation].join('\0')).digest('hex').slice(0,24),ref=db.collection('unifiedpayments').doc(id);
 const identity=createHash('sha256').update(JSON.stringify([kind,input.planId,String(input.tierId??'')])).digest('hex');
 const prepared=await db.runTransaction(async tx=>{
  const [user,plan,current]=await tx.getAll(db.collection('users').doc(userId),db.collection(kind==='service_plan'?'serviceplans':'subscriptionplans').doc(input.planId),ref);
  if(!user.exists||user.get('role')!=='client'||user.get('status')!=='active')throw new NativeCheckoutError('Client not found or inactive',403);
  if(current.exists){if(current.get('_nativeCheckoutIdentity')!==identity)throw new NativeCheckoutError('Checkout retry conflict',409);return {created:false,payment:nativeDates(current.data()!)};}
  if(!plan.exists||plan.get('isActive')!==true||(kind==='service_plan'&&plan.get('showToClients')!==true))throw new NativeCheckoutError('This plan is not available',404);
  let amount:number,durationDays:number,durationLabel:string,tierId='';
  if(kind==='service_plan'){
   const tiers=plan.get('pricingTiers')||[],requested=String(input.tierId??'');
   const tier=tiers.find((item:DocumentData)=>item.isActive&&String(item._id)===requested)||(/^\d+$/.test(requested)?tiers[Number(requested)]:null);
   if(!tier?.isActive)throw new NativeCheckoutError('This pricing option is not available',400);
   amount=tier.amount;durationDays=tier.durationDays;durationLabel=tier.durationLabel||`${durationDays} Days`;tierId=String(tier._id);
  }else{amount=plan.get('price');durationDays=Number(plan.get('duration'))*({weeks:7,months:30}[plan.get('durationType') as 'weeks'|'months']||1);durationLabel=`${plan.get('duration')} ${plan.get('durationType')}`;}
  if(!Number.isFinite(amount)||amount<=0||!Number.isSafeInteger(Math.round(amount*100))||!Number.isSafeInteger(durationDays)||durationDays<=0)throw new NativeCheckoutError('Invalid plan pricing or duration',400);
  const now=new Date(),payment=clean({_id:id,client:userId,dietitian:user.get('assignedDietitian')||plan.get('createdBy')||null,servicePlan:kind==='service_plan'?plan.id:null,paymentType:kind,planName:plan.get('name')||'',planCategory:plan.get('category')||'general-wellness',durationDays,durationLabel,baseAmount:amount,finalAmount:amount,amount,currency:kind==='service_plan'?'INR':plan.get('currency')||'INR',status:'pending',paymentStatus:'pending',paymentMethod:'razorpay',payerEmail:user.get('email')||'',payerPhone:user.get('phone')||'',payerName:`${user.get('firstName')||''} ${user.get('lastName')||''}`.trim(),daysUsed:0,remainingDays:durationDays,mealPlanCreated:false,createdAt:now,updatedAt:now,metadata:{planId:plan.id,pricingTierId:tierId},_nativeCheckoutIdentity:identity,_nativeCheckoutState:'creating'});
  tx.create(ref,payment);return {created:true,payment};
 });
 const payment=prepared.payment,receipt=`dtps_${id}`;
 let order:DocumentData;
 if(payment.razorpayOrderId)return payment;
 if(prepared.created){
  try{order=await provider.createOrder({amount:Math.round(payment.finalAmount*100),currency:payment.currency,receipt,notes:{payment_id:id,client_id:userId,plan_id:input.planId}});}
  catch{await ref.update({_nativeCheckoutState:'uncertain',updatedAt:new Date()});throw new NativeCheckoutError('Checkout could not be confirmed. Retry to recover the existing order.',503);}
 }else{
  const existing=await provider.findOrders(receipt);if(existing.length!==1)throw new NativeCheckoutError('Checkout is awaiting provider confirmation. Please retry shortly.',503);order=existing[0];
 }
 if(!/^order_[a-zA-Z0-9]+$/.test(order.id)||Number(order.amount)!==Math.round(payment.finalAmount*100)||order.currency!==payment.currency||order.receipt!==receipt)throw new NativeCheckoutError('Payment provider order mismatch',502);
 await db.runTransaction(async tx=>{const row=await tx.get(ref);if(!row.exists||row.get('client')!==userId||row.get('_nativeCheckoutIdentity')!==identity||row.get('razorpayOrderId')&&row.get('razorpayOrderId')!==order.id)throw new NativeCheckoutError('Checkout identity conflict',409);tx.update(ref,{razorpayOrderId:order.id,_nativeCheckoutState:'ready',updatedAt:new Date()});});
 return {...payment,razorpayOrderId:order.id};
}
export async function verifyNativeCheckout(db:MongoDatabase,userId:string,input:DocumentData,secret:string,provider:CheckoutProvider){
 const orderId=input.razorpay_order_id,paymentId=input.razorpay_payment_id,signature=input.razorpay_signature;
 if(typeof orderId!=='string'||!/^order_[a-zA-Z0-9]+$/.test(orderId)||typeof paymentId!=='string'||!/^pay_[a-zA-Z0-9]+$/.test(paymentId)||typeof signature!=='string'||!/^[a-f0-9]{64}$/i.test(signature)||!secret)throw new NativeCheckoutError('Invalid payment verification data',400);
 const expected=createHmac('sha256',secret).update(orderId+'|'+paymentId).digest();if(!timingSafeEqual(expected,Buffer.from(signature,'hex')))throw new NativeCheckoutError('Invalid payment signature',400);
 const proof=await provider.fetchPayment(paymentId);
 if(proof.id!==paymentId||proof.order_id!==orderId)throw new NativeCheckoutError('Payment identity mismatch',409);
 return settleNativeCapturedPayment(db,userId,proof);
}
/** Only call with a provider-fetched payment or a signature-verified webhook entity. */
export async function settleNativeCapturedPayment(db:MongoDatabase,userId:string,proof:DocumentData,authorize?:(tx:MongoTypes.Transaction)=>Promise<unknown>){
 const orderId=proof.order_id,paymentId=proof.id;
 if(typeof orderId!=='string'||!/^order_[a-zA-Z0-9]+$/.test(orderId)||typeof paymentId!=='string'||!/^pay_[a-zA-Z0-9]+$/.test(paymentId))throw new NativeCheckoutError('Invalid payment identity',400);
 const rows=await db.collection('unifiedpayments').where('razorpayOrderId','==',orderId).limit(2).get();if(rows.size!==1||rows.docs[0].get('client')!==userId)throw new NativeCheckoutError('Payment record not found or ambiguous',404);
 if(proof.id!==paymentId||proof.order_id!==orderId||proof.status!=='captured'||proof.captured!==true||Number(proof.amount_refunded||0)>0)throw new NativeCheckoutError('Payment is not captured for this order',409);
 return db.runTransaction(async tx=>{
  if(authorize)await authorize(tx);
  const ref=rows.docs[0].ref,claim=db.collection('_nativeRazorpayPayments').doc(paymentId),[row,claimed]=await tx.getAll(ref,claim);
  if(!row.exists||row.get('client')!==userId||row.get('razorpayOrderId')!==orderId)throw new NativeCheckoutError('Payment ownership changed',409);
  const data=nativeDates(row.data()!);
  if(Number(proof.amount)!==Math.round(Number(data.finalAmount??data.amount??data.baseAmount)*100)||proof.currency!==(data.currency||'INR'))throw new NativeCheckoutError('Payment amount or currency mismatch',409);
  if(claimed.exists&&claimed.get('paymentRecordId')!==ref.id||data.razorpayPaymentId&&data.razorpayPaymentId!==paymentId)throw new NativeCheckoutError('Payment already belongs to another transaction',409);
  const subscriptions=await tx.get(db.collection('clientsubscriptions').where('razorpayPaymentId','==',paymentId).limit(1));if(!subscriptions.empty)throw new NativeCheckoutError('Payment already belongs to a subscription',409);const legacy=await tx.get(db.collection('unifiedpayments').where('razorpayPaymentId','==',paymentId).limit(2));if(legacy.docs.some(item=>item.id!==ref.id))throw new NativeCheckoutError('Payment already belongs to another transaction',409);
  if(data.paymentStatus==='paid'&&data.razorpayPaymentId===paymentId)return {created:false,payment:{...data,_id:ref.id}};
  const now=new Date(),paidAt=data.paidAt||now,start=data.startDate||new Date(nativeHabitDay(null).start.getTime()+86400000),duration=Number(data.durationDays);
  if(!Number.isSafeInteger(duration)||duration<=0)throw new NativeCheckoutError('Payment duration requires review',409);
  const end=data.endDate||new Date(start.getTime()+(duration-1)*86400000);
  const patch={status:'paid',paymentStatus:'paid',razorpayPaymentId:paymentId,transactionId:paymentId,paidAt,startDate:start,endDate:end,expectedStartDate:data.expectedStartDate||start,expectedEndDate:data.expectedEndDate||end,remainingDays:Math.max(0,duration-Number(data.daysUsed||0)),updatedAt:now};
  tx.update(ref,patch);tx.set(claim,{paymentRecordId:ref.id,client:userId,orderId,verifiedAt:now});
  tx.set(db.collection('_nativeOutbox').doc('payment-paid-'+ref.id),{type:'payment-paid',paymentId:ref.id,clientId:userId,status:'pending',createdAt:now});
  return {created:true,payment:{...data,...patch,_id:ref.id}};
 });
}
