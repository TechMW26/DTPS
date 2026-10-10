import type * as MongoTypes from '@/lib/db/mongo-types';
import {createHash} from 'node:crypto';
import type {MongoDatabase,DocumentData} from '@/lib/db/mongo-types';
import {NativeCheckoutError} from './native-checkout';
import {nativeFinanceActor,nativeFinanceClientIds,nativeFinancePeople} from './native-finance-access';
import {nativeDates} from './native-plan-editor';
export interface NativeStripeProvider {create(data:DocumentData,key:string):Promise<DocumentData>;retrieve(id:string):Promise<DocumentData>}
const validId=(id:unknown):id is string=>typeof id==='string'&&/^[a-f0-9]{24}$/i.test(id);
const publicPayment=(data:DocumentData):DocumentData=>Object.fromEntries(Object.entries(nativeDates(data)).filter(([key])=>!key.startsWith('_native')&&!/signature|secret/i.test(key)));
export async function listNativePayments(db:MongoDatabase,userId:string,params:URLSearchParams){
 const actor=await nativeFinanceActor(db,userId),ids=await nativeFinanceClientIds(db,actor),page=Math.max(1,Math.min(10000,Number(params.get('page'))||1)),limit=Math.max(1,Math.min(100,Number(params.get('limit'))||10)),status=params.get('status');
 let query:MongoTypes.Query=db.collection('unifiedpayments');if(status)query=query.where('paymentStatus','==',status);
 let total:number,rows:MongoTypes.QueryDocumentSnapshot[];
 if(ids===null||actor.role==='client'){if(ids)query=query.where('client','==',userId);total=(await query.count().get()).data().count;rows=(await query.orderBy('createdAt','desc').offset((page-1)*limit).limit(limit).get()).docs;}
 else{const allowed=new Set(ids);const routing=(await query.select('client','createdAt').get()).docs.filter(row=>allowed.has(row.get('client'))).sort((a,b)=>(b.get('createdAt')?.toMillis?.()||0)-(a.get('createdAt')?.toMillis?.()||0));total=routing.length;const selected=routing.slice((page-1)*limit,page*limit);rows=selected.length?(await db.getAll(...selected.map(row=>row.ref))).filter(row=>row.exists) as MongoTypes.QueryDocumentSnapshot[]:[];}
 return {payments:await nativeFinancePeople(db,rows.map(row=>publicPayment({...row.data(),_id:row.id}))),pagination:{page,limit,total,pages:Math.ceil(total/limit)}};
}
export async function createNativeStripeConsultation(db:MongoDatabase,userId:string,input:DocumentData,key:string|null,provider:NativeStripeProvider){
 if(!key||!/^[\w.:-]{8,128}$/.test(key))throw new NativeCheckoutError('An idempotency key is required',400);
 if(!validId(input.appointmentId))throw new NativeCheckoutError('A booked consultation is required',400);
 const id=createHash('sha256').update(userId+'\0stripe\0'+key).digest('hex').slice(0,24),ref=db.collection('unifiedpayments').doc(id);
 const payment:DocumentData=await db.runTransaction(async tx=>{
  const [user,appointment,current]=await tx.getAll(db.collection('users').doc(userId),db.collection('appointments').doc(input.appointmentId),ref);
  if(!user.exists||user.get('role')!=='client'||user.get('status')!=='active')throw new NativeCheckoutError('Active client account required',403);
  if(!appointment.exists||appointment.get('client')!==userId||['cancelled','completed'].includes(appointment.get('status')))throw new NativeCheckoutError('Consultation unavailable',409);
  const dietitian=appointment.get('dietitian');if(!validId(dietitian))throw new NativeCheckoutError('Consultation provider missing',409);
  const staff=await tx.get(db.collection('users').doc(dietitian));if(!staff.exists||staff.get('status')!=='active'||staff.get('role')!=='dietitian')throw new NativeCheckoutError('Consultation provider unavailable',409);
  if(current.exists){if(current.get('appointment')!==input.appointmentId)throw new NativeCheckoutError('Checkout retry conflict',409);return current.data()!;}
  const amount=Number(appointment.get('consultationFee')??staff.get('consultationFee')),currency=String(appointment.get('currency')||staff.get('consultationCurrency')||process.env.STRIPE_CONSULTATION_CURRENCY||'').toUpperCase();
  if(!Number.isFinite(amount)||amount<=0||Math.round(amount*100)<1||Math.abs(amount*100-Math.round(amount*100))>1e-6||!Number.isSafeInteger(Math.round(amount*100))||!['INR','USD','EUR','GBP','AUD','CAD','NZD','SGD','AED'].includes(currency))throw new NativeCheckoutError('Consultation price and currency must be configured by staff',409);
  if(Number(input.amount)!==amount||String(input.currency).toUpperCase()!==currency)throw new NativeCheckoutError('Consultation price changed. Refresh before paying.',409);
  const prior=await tx.get(db.collection('unifiedpayments').where('appointment','==',input.appointmentId).where('paymentStatus','in',['pending','paid','failed']).limit(1));if(!prior.empty)throw new NativeCheckoutError('This consultation already has a payment. Resume the existing checkout.',409);
  const now=new Date(),data={_id:id,client:userId,dietitian,appointment:input.appointmentId,paymentType:'consultation',paymentMethod:'stripe',baseAmount:amount,finalAmount:amount,amount,currency,planName:'Consultation',description:'Consultation',durationDays:0,durationLabel:'One-time',status:'pending',paymentStatus:'pending',createdAt:now,updatedAt:now,_nativeStripeKey:key};tx.create(ref,data);return data;
 });
 // Stripe idempotency binds retries to one provider operation, including lost responses.
 const intent=payment.stripePaymentIntentId?await provider.retrieve(payment.stripePaymentIntentId):await provider.create({amount:Math.round(payment.finalAmount*100),currency:payment.currency.toLowerCase(),description:'Consultation',metadata:{paymentId:id,clientId:userId,appointmentId:payment.appointment}},'dtps-'+id);
 if(!/^pi_[\w]+$/.test(intent.id)||intent.amount!==Math.round(payment.finalAmount*100)||intent.currency.toUpperCase()!==payment.currency||intent.metadata?.paymentId!==id||intent.metadata?.clientId!==userId||intent.metadata?.appointmentId!==payment.appointment)throw new NativeCheckoutError('Provider payment identity mismatch',502);
 await db.runTransaction(async tx=>{const [row,actor]=await tx.getAll(ref,db.collection('users').doc(userId));if(actor.get('status')!=='active'||actor.get('role')!=='client')throw new NativeCheckoutError('Account access changed',403);if(!row.exists||row.get('client')!==userId||row.get('appointment')!==payment.appointment||row.get('stripePaymentIntentId')&&row.get('stripePaymentIntentId')!==intent.id)throw new NativeCheckoutError('Provider payment conflict',409);tx.update(ref,{stripePaymentIntentId:intent.id,updatedAt:new Date()});});
 return {payment:publicPayment({...payment,stripePaymentIntentId:intent.id}),paymentIntent:{id:intent.id,client_secret:intent.client_secret,status:intent.status}};
}
/** proof must come from Stripe retrieve or a signature-verified webhook. */
export async function settleNativeStripePayment(db:MongoDatabase,proof:DocumentData,userId?:string){
 if(!/^pi_[\w]+$/.test(proof.id||''))throw new NativeCheckoutError('Invalid payment identity',400);
 const rows=await db.collection('unifiedpayments').where('stripePaymentIntentId','==',proof.id).limit(2).get();if(rows.size!==1)throw new NativeCheckoutError('Payment not found or ambiguous',404);
 return db.runTransaction(async tx=>{
  const ref=rows.docs[0].ref,[row,claim]=await tx.getAll(ref,db.collection('_nativeStripePayments').doc(proof.id));
  if(!row.exists||row.get('stripePaymentIntentId')!==proof.id||userId&&row.get('client')!==userId)throw new NativeCheckoutError('Payment access denied',403);
  if(userId){const user=await tx.get(db.collection('users').doc(userId));if(!user.exists||user.get('status')!=='active'||user.get('role')!=='client')throw new NativeCheckoutError('Account inactive',403);}
  if(proof.metadata&&(proof.metadata.paymentId!==row.id||proof.metadata.clientId!==row.get('client')||proof.metadata.appointmentId!==row.get('appointment')))throw new NativeCheckoutError('Payment metadata mismatch',409);
  if(proof.amount!==Math.round(Number(row.get('finalAmount')??row.get('amount'))*100)||String(proof.currency).toUpperCase()!==row.get('currency')||claim.exists&&claim.get('paymentId')!==row.id)throw new NativeCheckoutError('Payment amount or identity mismatch',409);
  if(row.get('paymentStatus')==='paid')return publicPayment(row.data()!);
  const paid=proof.status==='succeeded';if(paid&&proof.amount_received!==proof.amount)throw new NativeCheckoutError('Full payment has not been received',409);
  if(!paid&&!['canceled','requires_payment_method'].includes(proof.status))return publicPayment(row.data()!);
  const now=new Date(),patch:DocumentData={status:paid?'completed':proof.status==='canceled'?'cancelled':'failed',paymentStatus:paid?'paid':proof.status==='canceled'?'cancelled':'failed',updatedAt:now};
  if(paid){patch.paidAt=now;tx.set(claim.ref,{paymentId:row.id,createdAt:now});tx.set(db.collection('_nativeOutbox').doc('payment-paid-'+row.id),{type:'payment-paid',paymentId:row.id,clientId:row.get('client'),status:'pending',createdAt:now});}
  tx.update(ref,patch);return publicPayment({...row.data(),...patch});
 });
}
export async function linkNativePaymentPlan(db:MongoDatabase,actorId:string,input:DocumentData){
 if(!validId(input.paymentId)||!validId(input.mealPlanId)||input.mealPlanCreated!==true)throw new NativeCheckoutError('A published linked meal plan is required',400);
 return db.runTransaction(async tx=>{
  const [actor,payment,plan]=await tx.getAll(db.collection('users').doc(actorId),db.collection('unifiedpayments').doc(input.paymentId),db.collection('clientmealplans').doc(input.mealPlanId));
  if(!actor.exists||actor.get('status')!=='active'||!['admin','dietitian','health_counselor'].includes(actor.get('role')))throw new NativeCheckoutError('Forbidden',403);
  if(!payment.exists||!plan.exists||plan.get('isDeleted')===true||!['active','completed'].includes(plan.get('status'))||(plan.get('clientId')||plan.get('client'))!==payment.get('client')||plan.get('purchaseId')!==payment.id)throw new NativeCheckoutError('Published plan does not belong to this purchase',409);
  const client=await tx.get(db.collection('users').doc(payment.get('client'))),role=actor.get('role'),assigned=role==='dietitian'?[client.get('assignedDietitian'),...(client.get('assignedDietitians')||[])]:[client.get('assignedHealthCounselor'),...(client.get('assignedHealthCounselors')||[])];
  if(role!=='admin'&&!assigned.includes(actorId))throw new NativeCheckoutError('Client access denied',403);
  const patch={mealPlanCreated:true,mealPlan:plan.id,updatedAt:new Date()};tx.update(payment.ref,patch);return publicPayment({...payment.data(),...patch});
 });
}
