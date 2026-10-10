import type * as MongoTypes from '@/lib/db/mongo-types';
import type {MongoDatabase,DocumentData} from '@/lib/db/mongo-types';
import {nativeDates} from './native-plan-editor';
import {hydrateNativeDocument} from '@/lib/storage/native-document';
export class NativeInvoiceError extends Error{constructor(message:string,public status:number){super(message);}}
export async function nativeInvoicePayment(db:MongoDatabase,paymentId:string,actorId:string,send=false){
 if(!/^[a-f0-9]{24}$/i.test(paymentId))throw new NativeInvoiceError('Invalid payment ID',400);
 const [payment,account]=await db.getAll(db.collection('unifiedpayments').doc(paymentId),db.collection('users').doc(actorId));
 if(!account.exists||account.get('status')==='inactive')throw new NativeInvoiceError('Forbidden',403);
 if(!payment.exists)throw new NativeInvoiceError('Payment not found',404);
 const clientId=payment.get('client');if(typeof clientId!=='string'||clientId.includes('/'))throw new NativeInvoiceError('Payment client requires reconciliation',409);
 const client=await db.collection('users').doc(clientId).get(),role=account.get('role');
 const assigned=role==='dietitian'?[payment.get('dietitian'),client.get('assignedDietitian'),...(client.get('assignedDietitians')||[])]:role==='health_counselor'?[client.get('assignedHealthCounselor'),...(client.get('assignedHealthCounselors')||[])]:[];
 if(role!=='admin'&&!(role==='client'&&!send&&actorId===clientId)&&!assigned.includes(actorId))throw new NativeInvoiceError('Forbidden',403);
 const person=client.exists?{_id:clientId,...Object.fromEntries(['firstName','lastName','email','phone'].filter(key=>client.get(key)!==undefined).map(key=>[key,client.get(key)]))}:null;
 return {...nativeDates(await hydrateNativeDocument(payment.data()!)),_id:payment.id,client:person};
}
export async function nativePublicPaymentLink(db:MongoDatabase,id:string):Promise<DocumentData|null>{
 if(!/^[a-zA-Z0-9_-]{1,100}$/.test(id))throw new NativeInvoiceError('Invalid payment link ID',400);
 let row:MongoTypes.DocumentSnapshot|undefined;
 if(/^[a-f0-9]{24}$/i.test(id))row=await db.collection('paymentlinks').doc(id).get();
 if(!row?.exists){const ids=id.startsWith('plink_')?[id]:[id,'plink_'+id];const rows=await db.collection('paymentlinks').where('razorpayPaymentLinkId','in',ids).limit(2).get();if(rows.size>1)throw new NativeInvoiceError('Payment link requires reconciliation',409);row=rows.docs[0];}
 if(!row?.exists||!row.get('showToClient'))return null;
 const data=nativeDates(row.data()!);
 const ids=[data.client,data.dietitian].filter(value=>typeof value==='string'&&/^[a-f0-9]{24}$/i.test(value));
 const people=ids.length?await db.getAll(...ids.map(id=>db.collection('users').doc(id)),{fieldMask:['firstName','lastName']}):[];
 const name=(id:string)=>{const user=people.find(row=>row.id===id);return user?.exists?{firstName:user.get('firstName')||'',lastName:user.get('lastName')||''}:undefined;};
 return {...Object.fromEntries(['amount','tax','discount','finalAmount','currency','planName','planCategory','duration','status','expireDate','paidAt','razorpayPaymentLinkUrl','razorpayPaymentLinkShortUrl','createdAt'].filter(key=>data[key]!==undefined).map(key=>[key,data[key]])),_id:row.id,client:name(data.client),dietitian:name(data.dietitian)};
}
