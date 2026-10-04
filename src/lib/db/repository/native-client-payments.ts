import type {Firestore,DocumentData} from 'firebase-admin/firestore';
import {nativeDates} from './native-plan-editor';
import {hydrateNativeDocument} from '@/lib/storage/native-document';
const fields=['dietitian','type','paymentType','planName','description','amount','finalAmount','baseAmount','discountAmount','taxAmount','currency','status','paymentStatus','paidAt','createdAt','dueDate','durationDays','durationLabel','features','planCategory','razorpayPaymentLinkUrl','razorpayPaymentLinkShortUrl','expectedStartDate','expectedEndDate','startDate','endDate'];
export async function nativeClientPayments(db:Firestore,userId:string,limit?:number):Promise<DocumentData[]>{
 let query=db.collection('unifiedpayments').where('client','==',userId).orderBy('createdAt','desc').select(...fields,'_nativeExternalFields');if(limit)query=query.limit(limit);
 const rows=await query.get();const staff=new Map<string,DocumentData|null>();
 const result=[];
 for(const doc of rows.docs){
  const raw=doc.data();raw._nativeExternalFields=(raw._nativeExternalFields||[]).filter((ref:any)=>fields.includes(ref.path?.[0]));
  const data=nativeDates(await hydrateNativeDocument(raw));delete data._nativeExternalFields;
  const id=data.dietitian;
  if(typeof id==='string'&&id&&!id.includes('/')){
   if(!staff.has(id)){const person=await db.collection('users').doc(id).get();staff.set(id,person.exists?{_id:id,firstName:person.get('firstName')||'',lastName:person.get('lastName')||''}:null);}
   data.dietitian=staff.get(id);
  }
  result.push({...data,_id:doc.id});
 }
 return result;
}

export async function nativeClientReceipt(db:Firestore,userId:string,lookup:{paymentId?:string|null;orderId?:string|null;razorpayPaymentId?:string|null}){
 let row:FirebaseFirestore.DocumentSnapshot|undefined;
 if(lookup.paymentId){if(!/^[a-f0-9]{24}$/.test(lookup.paymentId))return null;row=await db.collection('unifiedpayments').doc(lookup.paymentId).get();}
 else{
  let query=db.collection('unifiedpayments').where('client','==',userId);
  if(lookup.orderId)query=query.where('razorpayOrderId','==',lookup.orderId);
  else if(lookup.razorpayPaymentId)query=query.where('razorpayPaymentId','==',lookup.razorpayPaymentId);
  else query=query.where('status','in',['completed','paid']);
  row=(await query.orderBy('createdAt','desc').limit(1).get()).docs[0];
 }
 if(!row?.exists||row.get('client')!==userId)return null;
 const payment=nativeDates(await hydrateNativeDocument(row.data()!));
 async function person(id:unknown){if(typeof id!=='string'||!id||id.includes('/'))return null;const doc=await db.collection('users').doc(id).get();return doc.exists?{_id:id,...Object.fromEntries(['firstName','lastName','email','phone'].filter(key=>doc.get(key)!==undefined).map(key=>[key,doc.get(key)]))}:null;}
 const [client,dietitian]=await Promise.all([person(userId),person(payment.dietitian)]);
 return {...payment,_id:row.id,amount:payment.finalAmount??payment.amount??payment.baseAmount??0,client,dietitian};
}
