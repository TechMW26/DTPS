import {createHash,randomBytes} from 'node:crypto';
import {Filter,type Firestore,type DocumentData,type Query} from 'firebase-admin/firestore';
import {z} from 'zod';
import {nativeFinanceActor,nativeFinanceClient,nativeFinancePeople} from './native-finance-access';
import {NativeCheckoutError} from './native-checkout';
import {nativeDates} from './native-plan-editor';
import {nativeHabitDay} from './native-habits';
import {storeNativeFile} from '@/lib/storage/migration-blob-storage';
const valid=(id:unknown)=>typeof id==='string'&&/^[a-f0-9]{24}$/i.test(id);
const schema=z.object({clientId:z.string().regex(/^[a-f0-9]{24}$/i),platform:z.enum(['upi','bank_transfer','cash','phonepe','gpay','paytm','other']),customPlatform:z.string().max(100).default(''),transactionId:z.string().trim().min(1).max(200),amount:z.coerce.number().finite().positive().max(1e8),paymentLinkId:z.string().regex(/^[a-f0-9]{24}$/i).optional(),planName:z.string().max(200).default(''),planCategory:z.string().max(100).default(''),durationDays:z.coerce.number().int().min(1).max(36500).optional(),durationLabel:z.string().max(100).default(''),paymentDate:z.string().max(40).optional(),notes:z.string().max(2000).default('')});
function canStaff(actor:DocumentData,client:DocumentData,id:string){return actor.role==='admin'||(actor.role==='dietitian'?[client.assignedDietitian,...(client.assignedDietitians||[])]:actor.role==='health_counselor'?[client.assignedHealthCounselor,...(client.assignedHealthCounselors||[])]:[]).includes(id);}
export async function createNativeOtherPayment(db:Firestore,actorId:string,input:unknown,file?:File|null){
 const parsed=schema.safeParse(input);if(!parsed.success)throw new NativeCheckoutError('Invalid payment fields',400);const data=parsed.data;if(Math.round(data.amount*100)<1||Math.abs(data.amount*100-Math.round(data.amount*100))>1e-6)throw new NativeCheckoutError('Amount must have at most two decimal places',400);const actor=await nativeFinanceActor(db,actorId);await nativeFinanceClient(db,actor,data.clientId,true);
 let blob:any,fileId:string|undefined;
 if(file&&file.size){if(file.size>10*1024*1024||!['image/jpeg','image/png','image/webp','application/pdf'].includes(file.type))throw new NativeCheckoutError('Receipt must be an image or PDF up to 10 MB',400);blob=await storeNativeFile(Buffer.from(await file.arrayBuffer()),file.type);fileId=randomBytes(12).toString('hex');}
 const paymentDate=data.paymentDate?(data.paymentDate.length===10?nativeHabitDay(data.paymentDate).start:new Date(data.paymentDate)):new Date();if(!Number.isFinite(paymentDate.getTime())||paymentDate.getTime()>Date.now()+86400000)throw new NativeCheckoutError('Invalid payment date',400);
 const identity=createHash('sha256').update(data.platform+'\0'+data.transactionId.toLowerCase()).digest('hex'),ref=db.collection('otherplatformpayments').doc(identity.slice(0,24)),claim=db.collection('_nativeOtherTransactions').doc(identity);
 return db.runTransaction(async tx=>{
  const refs=[db.collection('users').doc(actorId),db.collection('users').doc(data.clientId),ref,claim];if(data.paymentLinkId)refs.push(db.collection('paymentlinks').doc(data.paymentLinkId));
  const [staff,client,current,claimed,link]=await tx.getAll(...refs);
  if(!staff.exists||staff.get('status')!=='active'||!client.exists||client.get('role')!=='client'||!canStaff(staff.data()!,client.data()!,actorId))throw new NativeCheckoutError('Client access denied',403);
  const legacy=await tx.get(db.collection('otherplatformpayments').where('transactionId','==',data.transactionId).where('platform','==',data.platform).limit(2));
  const existing=current.exists?current:legacy.docs[0];
  if(legacy.size>1)throw new NativeCheckoutError('Duplicate transactions require reconciliation',409);
  if(existing){if(existing.get('client')!==data.clientId||Number(existing.get('amount'))!==data.amount||existing.get('paymentLink')!==(data.paymentLinkId||null))throw new NativeCheckoutError('Transaction already recorded with different details',409);return {...nativeDates(existing.data()!),_id:existing.id};}
  if(claimed.exists||legacy.size>1)throw new NativeCheckoutError('Transaction requires reconciliation',409);
  if(data.paymentLinkId&&(!link?.exists||link.get('client')!==data.clientId||['paid','cancelled'].includes(link.get('status'))||Math.round(Number(link.get('finalAmount'))*100)!==Math.round(data.amount*100)))throw new NativeCheckoutError('Payment link amount or ownership mismatch',409);
  if(link?.exists&&link.get('currency')&&link.get('currency')!=='INR')throw new NativeCheckoutError('Offline receipt currency must match INR',409);const duration=link?.get('durationDays')??data.durationDays;if(!Number.isSafeInteger(duration)||duration<=0)throw new NativeCheckoutError('A verified plan duration is required',400);
  const now=new Date(),payment:DocumentData={_id:ref.id,client:data.clientId,dietitian:actorId,platform:data.platform,customPlatform:data.platform==='other'?data.customPlatform:'',transactionId:data.transactionId,amount:data.amount,paymentLink:data.paymentLinkId||null,planName:link?.get('planName')||data.planName,planCategory:link?.get('planCategory')||data.planCategory,durationDays:duration,durationLabel:link?.get('duration')||data.durationLabel,paymentDate,notes:data.notes,status:'pending',createdAt:now,updatedAt:now,...(fileId?{receiptImage:'/api/receipts/'+fileId,receiptImageUrl:'/api/receipts/'+fileId,receiptImageFileId:fileId}:{})};
  tx.create(ref,payment);tx.create(claim,{paymentId:ref.id,clientId:data.clientId,createdAt:now});
  if(fileId&&file&&blob){tx.create(db.collection('receipts.files').doc(fileId),{_id:fileId,length:file.size,filename:file.name,contentType:file.type,metadata:{clientId:data.clientId,uploadedBy:actorId,originalName:file.name},uploadDate:now});tx.create(db.collection('_mediaAssets').doc(createHash('sha256').update('receipts.files\0'+fileId).digest('hex')),{sourceCollection:'receipts.files',sourceId:fileId,blob,verification:'sha256-readback',mimeType:file.type,originalName:file.name});}
  return payment;
 });
}
export async function listNativeOtherPayments(db:Firestore,actorId:string,params:URLSearchParams){
 const actor=await nativeFinanceActor(db,actorId);let query:Query=db.collection('otherplatformpayments');const clientId=params.get('clientId'),status=params.get('status');
 if(actor.role==='client')query=query.where('client','==',actorId);else if(actor.role!=='admin')query=query.where('dietitian','==',actorId);
 if(clientId){await nativeFinanceClient(db,actor,clientId);query=query.where('client','==',clientId);}if(status)query=query.where('status','==',status);
 const rows=await query.orderBy('createdAt','desc').get(),records=rows.docs.filter(row=>!row.get('deletedAt')).map(row=>({...nativeDates(row.data()),_id:row.id}));
 return nativeFinancePeople(db,records);
}
export async function readNativeOtherPayment(db:Firestore,actorId:string,id:string){
 if(!valid(id))throw new NativeCheckoutError('Invalid payment ID',400);const actor=await nativeFinanceActor(db,actorId),row=await db.collection('otherplatformpayments').doc(id).get();if(!row.exists||row.get('deletedAt'))throw new NativeCheckoutError('Payment not found',404);
 if(actor.role!=='admin'&&!(row.get('client')===actorId||row.get('dietitian')===actorId))await nativeFinanceClient(db,actor,row.get('client'));
 return (await nativeFinancePeople(db,[{...nativeDates(row.data()!),_id:id}]))[0];
}
export async function reviewNativeOtherPayment(db:Firestore,actorId:string,id:string,input:unknown){
 if(!valid(id))throw new NativeCheckoutError('Invalid payment ID',400);const parsed=z.object({status:z.enum(['approved','rejected']),reviewNotes:z.string().max(2000).default('')}).safeParse(input);if(!parsed.success)throw new NativeCheckoutError('Invalid review',400);
 return db.runTransaction(async tx=>{
  const ref=db.collection('otherplatformpayments').doc(id),[actor,row]=await tx.getAll(db.collection('users').doc(actorId),ref);
  if(!actor.exists||actor.get('role')!=='admin'||actor.get('status')!=='active')throw new NativeCheckoutError('Admin access required',403);
  if(!row.exists||row.get('deletedAt'))throw new NativeCheckoutError('Payment not found',404);const data=nativeDates(row.data()!);
  if(data.status===parsed.data.status)return {...data,_id:id};if(data.status!=='pending')throw new NativeCheckoutError('Payment already reviewed',409);
  const now=new Date(),patch={status:parsed.data.status,reviewNotes:parsed.data.reviewNotes,reviewedBy:actorId,reviewedAt:now,updatedAt:now};
  if(parsed.data.status==='approved'){
   const linkRef=valid(data.paymentLink)?db.collection('paymentlinks').doc(data.paymentLink):null,link=linkRef?await tx.get(linkRef):null;
   if(link&&(!link.exists||link.get('client')!==data.client||['paid','cancelled','expired'].includes(link.get('status'))||Math.round(Number(link.get('finalAmount'))*100)!==Math.round(data.amount*100)))throw new NativeCheckoutError('Payment link requires reconciliation before approval',409);
   const clauses=[Filter.where('otherPlatformPayment','==',id)];if(linkRef)clauses.push(Filter.where('paymentLink','==',linkRef.id));
   const existing=await tx.get(db.collection('unifiedpayments').where(Filter.or(...clauses)).limit(2));if(existing.size>1||existing.docs.some(doc=>doc.get('client')!==data.client||doc.get('paymentStatus')==='paid'))throw new NativeCheckoutError('Payment entitlement already exists or is ambiguous',409);
   if(link?.exists&&link.get('currency')&&link.get('currency')!=='INR')throw new NativeCheckoutError('Receipt currency requires reconciliation',409);const duration=Number(link?.get('durationDays')??data.durationDays);if(!Number.isSafeInteger(duration)||duration<=0)throw new NativeCheckoutError('Plan duration requires reconciliation',409);
   const paymentRef=existing.docs[0]?.ref||db.collection('unifiedpayments').doc(createHash('sha256').update('other-payment\0'+id).digest('hex').slice(0,24));if(existing.empty&&(await tx.get(paymentRef)).exists)throw new NativeCheckoutError('Payment identity conflict',409);
   const start=new Date(nativeHabitDay(null).start.getTime()+86400000),end=new Date(start.getTime()+(duration-1)*86400000);
   const payment={client:data.client,dietitian:data.dietitian,otherPlatformPayment:id,paymentLink:linkRef?.id||null,servicePlan:link?.get('servicePlanId')||null,paymentType:'service_plan',planName:link?.get('planName')||data.planName||'Service Plan',planCategory:link?.get('planCategory')||data.planCategory||'general-wellness',durationDays:duration,durationLabel:link?.get('duration')||data.durationLabel||`${duration} Days`,baseAmount:link?.get('amount')||data.amount,discountPercent:link?.get('discount')||0,taxPercent:link?.get('tax')||0,finalAmount:data.amount,amount:data.amount,currency:link?.get('currency')||data.currency||'INR',status:'paid',paymentStatus:'paid',paymentMethod:data.platform==='other'?data.customPlatform:data.platform,transactionId:`OPP-${id}-${data.transactionId}`,purchaseDate:now,paidAt:now,startDate:start,endDate:end,expectedStartDate:start,expectedEndDate:end,mealPlanCreated:false,daysUsed:0,remainingDays:duration,updatedAt:now};
   if(existing.empty)tx.create(paymentRef,{...payment,_id:paymentRef.id,createdAt:now});else tx.update(paymentRef,payment);
   if(linkRef)tx.update(linkRef,{status:'paid',paidAt:now,updatedAt:now});tx.set(db.collection('_nativeOutbox').doc('payment-paid-'+paymentRef.id),{type:'payment-paid',paymentId:paymentRef.id,clientId:data.client,status:'pending',createdAt:now});
  }
  tx.update(ref,patch);return {...data,...patch,_id:id};
 });
}
export async function deleteNativeOtherPayment(db:Firestore,actorId:string,id:string){
 if(!valid(id))throw new NativeCheckoutError('Invalid payment ID',400);
 await db.runTransaction(async tx=>{const ref=db.collection('otherplatformpayments').doc(id),[actor,row]=await tx.getAll(db.collection('users').doc(actorId),ref);if(!actor.exists||actor.get('role')!=='admin'||actor.get('status')!=='active')throw new NativeCheckoutError('Admin access required',403);if(!row.exists)throw new NativeCheckoutError('Payment not found',404);if(row.get('status')==='approved')throw new NativeCheckoutError('Approved payments must be refunded rather than deleted',409);tx.update(ref,{deletedAt:new Date(),updatedAt:new Date()});});
}
