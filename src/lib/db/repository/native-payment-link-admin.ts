import {createHash,randomBytes} from 'node:crypto';
import {Filter,type Firestore,type DocumentData,type Query} from 'firebase-admin/firestore';
import {z} from 'zod';
import {NativeCheckoutError} from './native-checkout';
import {nativeHabitDay} from './native-habits';
import {nativeDates} from './native-plan-editor';
import {nativeFinanceActor,nativeFinanceClient,nativeFinanceClientIds,nativeFinancePeople} from './native-finance-access';
import {verifyNativePaymentLink} from './native-payment-link';
export interface NativeLinkProvider {create(data:DocumentData):Promise<DocumentData>;find(reference:string):Promise<DocumentData[]>;cancel(id:string):Promise<DocumentData>}
export type NativePaymentLinkStatusProvider = (id:string)=>Promise<DocumentData>;
const schema=z.object({clientId:z.string().regex(/^[a-f0-9]{24}$/i),amount:z.number().finite().positive().max(1e8),tax:z.number().min(0).max(100).default(0),discount:z.number().min(0).max(100).default(0),finalAmount:z.number().finite().positive().max(1e8),planCategory:z.string().max(100).optional(),planName:z.string().max(200).optional(),duration:z.string().max(100).optional(),durationDays:z.number().int().min(1).max(36500),servicePlanId:z.string().regex(/^[a-f0-9]{24}$/i).optional(),pricingTierId:z.string().max(100).optional(),catalogue:z.string().max(200).optional(),expireDate:z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/),z.string().datetime({offset:true})]).optional(),notes:z.string().max(1000).optional(),showToClient:z.boolean().default(true)});
const clean=(row:DocumentData)=>Object.fromEntries(Object.entries(row).filter(([,value])=>value!==undefined));
const exposed=(row:DocumentData)=>Object.fromEntries(Object.entries(row).filter(([key])=>!key.startsWith('_native')&&key!=='razorpaySignature'));
export async function createNativeStaffPaymentLink(db:Firestore,actorId:string,input:unknown,key:string|null,provider:NativeLinkProvider,callbackUrl:string){
 const parsed=schema.safeParse(input);if(!parsed.success)throw new NativeCheckoutError('Invalid payment link fields',400);const data=parsed.data;const expiry=data.expireDate?(data.expireDate.length===10?new Date(nativeHabitDay(data.expireDate).end.getTime()-1):new Date(data.expireDate)):undefined;
 const actor=await nativeFinanceActor(db,actorId),client=await nativeFinanceClient(db,actor,data.clientId,true);
 if(expiry&&expiry.getTime()<=Date.now())throw new NativeCheckoutError('Expiry must be in the future',400);
 const expected=Math.round(data.amount*(1+(data.tax-data.discount)/100)*100),actual=Math.round(data.finalAmount*100);
 // The editable final amount is in paise; its displayed percentage is rounded to
 // two decimals. Reconcile only that rounding interval, then enforce the exact
 // effective discount against the plan limit below (never the rounded display).
 const effectiveDiscount=(data.amount*(1+data.tax/100)-actual/100)*100/data.amount;
 if(Math.abs(expected-actual)>1&&Math.abs(effectiveDiscount-data.discount)>0.005+1e-9)throw new NativeCheckoutError('Final amount does not match tax and discount',400);
 if(actual>Math.round(data.amount*(1+data.tax/100)*100)||actual<Math.round(data.amount*data.tax))throw new NativeCheckoutError('Invalid final amount',400);
 data.discount=Math.max(0,Math.min(100,effectiveDiscount));
 data.finalAmount=actual/100;

 if(!key||!/^[\w.:-]{8,128}$/.test(key))throw new NativeCheckoutError('Idempotency key required',400);const operation=key,id=createHash('sha256').update(actorId+'\0'+operation).digest('hex').slice(0,24),ref=db.collection('paymentlinks').doc(id),identity=createHash('sha256').update(JSON.stringify(data)).digest('hex');
 const prepared=await db.runTransaction(async tx=>{
  const [current,account,user]=await tx.getAll(ref,db.collection('users').doc(actorId),db.collection('users').doc(data.clientId));
  const role=account.get('role'),assigned=role==='dietitian'?[user.get('assignedDietitian'),...(user.get('assignedDietitians')||[])]:role==='health_counselor'?[user.get('assignedHealthCounselor'),...(user.get('assignedHealthCounselors')||[])]:[];
  if(!account.exists||!user.exists||user.get('role')!=='client'||account.get('status')!=='active'||role!=='admin'&&!assigned.includes(actorId))throw new NativeCheckoutError('Client access changed',403);
  if(data.servicePlanId){
   const plan=await tx.get(db.collection('serviceplans').doc(data.servicePlanId));
   const tier=(plan.get('pricingTiers')||[]).find((row:DocumentData)=>row._id===data.pricingTierId);
   if(!plan.exists||!plan.get('isActive')||!tier?.isActive)throw new NativeCheckoutError('This plan or duration is unavailable. Close and reopen Generate Link to refresh plans.',409);
   if(Math.round(tier.amount*100)!==Math.round(data.amount*100)||tier.durationDays!==data.durationDays)throw new NativeCheckoutError('Plan price or duration changed. Close and reopen Generate Link to load current pricing.',409);
   const maxDiscount=Number(tier.maxDiscount??plan.get('maxDiscountPercent')??0);
   if(actual<Math.round(data.amount*(1+(data.tax-maxDiscount)/100)*100))throw new NativeCheckoutError(`Maximum discount for this duration is ${maxDiscount}%. Please adjust the final amount.`,409);
  }
  if(current.exists){if(current.get('_nativeRequestIdentity')!==identity)throw new NativeCheckoutError('Payment link retry conflict',409);return {created:false,data:nativeDates(current.data()!)};}
  const now=new Date(),{clientId,...rest}=data,row=clean({...rest,_id:id,client:clientId,dietitian:actorId,currency:'INR',status:'pending',expireDate:expiry,createdAt:now,updatedAt:now,_nativeRequestIdentity:identity,_nativeProviderState:'creating'});tx.create(ref,row);return {created:true,data:row};
 });
 if(prepared.data.razorpayPaymentLinkId)return exposed(prepared.data);
 const reference='dtps_'+id;let link:DocumentData;
 if(prepared.created){try{link=await provider.create(clean({amount:actual,currency:'INR',reference_id:reference,accept_partial:false,description:data.planName?`Payment for ${data.planName}`:'DTPS payment',customer:clean({name:[client.firstName,client.lastName].filter(Boolean).join(' ')||'Customer',email:client.email||undefined,contact:typeof client.phone==='string'&&/^\+?\d{8,14}$/.test(client.phone)?client.phone:undefined}),notify:{sms:false,email:false},reminder_enable:false,notes:{clientId:data.clientId,dietitianId:actorId,paymentLinkId:id},callback_url:callbackUrl,callback_method:'get',expire_by:expiry?Math.floor(expiry.getTime()/1000):undefined}));}catch{await ref.update({_nativeProviderState:'uncertain',updatedAt:new Date()});throw new NativeCheckoutError('Payment link creation requires verification; retry with the same request key',503);}}
 else{const found=await provider.find(reference);if(found.length!==1)throw new NativeCheckoutError('Payment link creation is still being reconciled',409);link=found[0];}
 if(!/^plink_[a-zA-Z0-9]+$/.test(link.id)||link.reference_id!==reference||Number(link.amount)!==actual||link.currency!=='INR'||typeof link.short_url!=='string'||!/^https:\/\//.test(link.short_url))throw new NativeCheckoutError('Payment provider response mismatch',502);
 const patch={razorpayPaymentLinkId:link.id,razorpayPaymentLinkUrl:link.short_url,razorpayPaymentLinkShortUrl:link.short_url,_nativeProviderState:'ready',updatedAt:new Date()};
 await db.runTransaction(async tx=>{const [current,actorNow,clientNow]=await tx.getAll(ref,db.collection('users').doc(actorId),db.collection('users').doc(data.clientId));const roleNow=actorNow.get('role'),assignedNow=roleNow==='dietitian'?[clientNow.get('assignedDietitian'),...(clientNow.get('assignedDietitians')||[])]:roleNow==='health_counselor'?[clientNow.get('assignedHealthCounselor'),...(clientNow.get('assignedHealthCounselors')||[])]:[];if(!actorNow.exists||!clientNow.exists||clientNow.get('role')!=='client'||actorNow.get('status')!=='active'||roleNow!=='admin'&&!assignedNow.includes(actorId))throw new NativeCheckoutError('Client access changed',403);if(!current.exists||current.get('_nativeRequestIdentity')!==identity||['paid','cancelled'].includes(current.get('status')))throw new NativeCheckoutError('Payment link changed',409);if(current.get('razorpayPaymentLinkId')&&current.get('razorpayPaymentLinkId')!==link.id)throw new NativeCheckoutError('Payment link identity conflict',409);tx.update(ref,patch);tx.set(db.collection('_nativeOutbox').doc('payment-link-created-'+id),{type:'payment-link-created',paymentLinkId:id,clientId:data.clientId,status:'pending',createdAt:new Date()});});
 return exposed({...prepared.data,...patch});
}
async function reconcileListedPaymentLinks(db:Firestore,page:FirebaseFirestore.DocumentSnapshot[],fetchLink:NativePaymentLinkStatusProvider){
 // Keep list loads bounded: reconcile the visible first 20 unresolved links in parallel.
 // Older rows remain available through the explicit Sync action and webhook processing.
 const candidates=page.filter(row=>['pending','created','partially_paid'].includes(String(row.get('status')||''))&&typeof row.get('razorpayPaymentLinkId')==='string').slice(0,20);
 await Promise.all(candidates.map(async row=>{
  const providerId=row.get('razorpayPaymentLinkId') as string;
  try{
   const proof=await Promise.race([fetchLink(providerId),new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error('provider timeout')),2500))]);
   if(proof.id!==providerId)return;
   if(proof.status==='paid'){
    await verifyNativePaymentLink(db,row.get('client'),providerId,async()=>proof);
    return;
   }
   if(!['created','partially_paid','expired','cancelled'].includes(proof.status))return;
   await db.runTransaction(async tx=>{
    const current=await tx.get(row.ref);
    if(!current.exists||current.get('razorpayPaymentLinkId')!==providerId||current.get('status')==='paid')return;
    tx.update(row.ref,{status:proof.status==='created'||proof.status==='partially_paid'?'pending':proof.status,updatedAt:new Date()});
   });
  }catch{
   // Provider outages must not make the payment list fail; the cached state remains visible.
  }
 }));
}
export async function listNativeStaffPaymentLinks(db:Firestore,actorId:string,params:URLSearchParams,fetchLink?:NativePaymentLinkStatusProvider){
 const actor=await nativeFinanceActor(db,actorId),clientId=params.get('clientId'),limit=Number(params.get('limit')||50),skip=Number(params.get('skip')||0),status=params.get('status');
 if(!Number.isSafeInteger(limit)||limit<1||limit>200||!Number.isSafeInteger(skip)||skip<0||skip>100000)throw new NativeCheckoutError('Invalid pagination',400);
 let query:Query=db.collection('paymentlinks');
 if(clientId){await nativeFinanceClient(db,actor,clientId);query=query.where('client','==',clientId);}else if(actor.role==='client')query=query.where('client','==',actorId);
 if(actor.role==='client')query=query.where('showToClient','==',true);if(status)query=query.where('status','==',status);
 let page:FirebaseFirestore.DocumentSnapshot[],total:number;
 if(!clientId&&['dietitian','health_counselor'].includes(actor.role)){
  // Project only routing fields for assignment visibility; retrieve full records for this page only.
  const [rows,ids]=await Promise.all([query.select('client','dietitian','createdAt').orderBy('createdAt','desc').get(),nativeFinanceClientIds(db,actor)]),allowed=new Set(ids||[]),selected=rows.docs.filter(row=>row.get('dietitian')===actorId||allowed.has(row.get('client')));total=selected.length;const slice=selected.slice(skip,skip+limit);page=slice.length?await db.getAll(...slice.map(row=>row.ref)):[];
 }else{const [rows,count]=await Promise.all([query.orderBy('createdAt','desc').offset(skip).limit(limit).get(),query.count().get()]);page=rows.docs;total=count.data().count;}
 if(fetchLink)await reconcileListedPaymentLinks(db,page,fetchLink);
 if(fetchLink&&page.length)page=await db.getAll(...page.map(row=>row.ref));
 return {success:true,paymentLinks:await nativeFinancePeople(db,page.map(row=>exposed({...nativeDates(row.data()!),_id:row.id}))),total,limit,skip};
}
export async function cancelNativeStaffPaymentLink(db:Firestore,actorId:string,id:string,provider:NativeLinkProvider){
 if(!/^[a-f0-9]{24}$/i.test(id))throw new NativeCheckoutError('Invalid payment link ID',400);
 const actor=await nativeFinanceActor(db,actorId),ref=db.collection('paymentlinks').doc(id),row=await ref.get();
 if(!row.exists)throw new NativeCheckoutError('Payment link not found',404);
 if(actor.role!=='admin'&&(!['dietitian','health_counselor'].includes(actor.role)||row.get('dietitian')!==actorId))throw new NativeCheckoutError('Forbidden',403);
 if(row.get('status')==='paid')throw new NativeCheckoutError('Paid links cannot be cancelled',409);
 if(row.get('status')==='cancelled')return;
 if(row.get('razorpayPaymentLinkId')){const proof=await provider.cancel(row.get('razorpayPaymentLinkId'));if(proof.id!==row.get('razorpayPaymentLinkId')||proof.status!=='cancelled')throw new NativeCheckoutError('Provider did not confirm cancellation',409);}
 await db.runTransaction(async tx=>{const [current,actorNow]=await tx.getAll(ref,db.collection('users').doc(actorId));if(!current.exists||actorNow.get('status')!=='active'||actorNow.get('role')!=='admin'&&(!['dietitian','health_counselor'].includes(actorNow.get('role'))||current.get('dietitian')!==actorId))throw new NativeCheckoutError('Access changed',403);if(current.get('razorpayPaymentLinkId')!==row.get('razorpayPaymentLinkId'))throw new NativeCheckoutError('Payment link identity changed',409);if(current.get('status')==='paid')throw new NativeCheckoutError('Payment was completed; cancellation requires review',409);tx.update(ref,{status:'cancelled',updatedAt:new Date()});});
}
export async function nativeAuthorizedPaymentLink(db:Firestore,actorId:string,id:unknown,write=false){
 if(typeof id!=='string'||!/^[a-f0-9]{24}$/i.test(id))throw new NativeCheckoutError('Invalid payment link ID',400);
 const actor=await nativeFinanceActor(db,actorId),row=await db.collection('paymentlinks').doc(id).get();if(!row.exists)throw new NativeCheckoutError('Payment link not found',404);
 if(actor.role==='client'&&(!row.get('showToClient')||write))throw new NativeCheckoutError('Forbidden',403);
 if(!(actor.role==='admin'||['dietitian','health_counselor'].includes(actor.role)&&row.get('dietitian')===actorId))await nativeFinanceClient(db,actor,row.get('client'),write);
 return (await nativeFinancePeople(db,[exposed({...nativeDates(row.data()!),_id:row.id})]))[0];
}
