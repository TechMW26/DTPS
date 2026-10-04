import {getNativeDatabase} from '@/lib/db/firestore-native';
import {nativeDates} from '@/lib/db/repository/native-plan-editor';
import {sendEmail} from '@/lib/services/email';
import {generateEmailInvoiceHTML,buildInvoiceDataFromPayment} from '@/lib/services/invoiceTemplate';

/** Returns a provider acknowledgement; the outbox owns retry/uncertain delivery state. */
export async function deliverNativePaymentInvoice(paymentId:string):Promise<'sent'|'skipped'|'disabled'> {
 if(process.env.NODE_ENV!=='production')return 'disabled';
 if(!/^[a-f0-9]{24}$/.test(paymentId))throw new Error('Invalid payment ID');
 const db=getNativeDatabase(),row=await db.collection('unifiedpayments').doc(paymentId).get();
 if(!row.exists)throw new Error('Payment not found');
 const payment=nativeDates(row.data());
 if(payment.paymentStatus!=='paid'&&!['paid','completed'].includes(payment.status))throw new Error('Payment is not paid');
 const client=await db.collection('users').doc(payment.client).get();
 const person=client.exists?Object.fromEntries(['firstName','lastName','email','phone'].filter(key=>client.get(key)!==undefined).map(key=>[key,client.get(key)])):null;
 const recipient=person?.email||payment.payerEmail;if(!recipient)return 'skipped';
 const template=generateEmailInvoiceHTML(buildInvoiceDataFromPayment({...payment,_id:row.id,client:person}));
 if(!await sendEmail({to:recipient,subject:template.subject,html:template.html,text:template.text}))throw new Error('Invoice provider did not confirm delivery');
 return 'sent';
}
/** Legacy callers enqueue the durable effect instead of sending a duplicate email directly. */
export async function sendInvoiceOnPayment(paymentId:string):Promise<void>{
 if(!/^[a-f0-9]{24}$/.test(paymentId))throw new Error('Invalid payment ID');
 const db=getNativeDatabase(),ref=db.collection('_nativeOutbox').doc('invoice-email-'+paymentId);
 await db.runTransaction(async tx=>{
  const row=await tx.get(ref);if(row.exists)return;
  tx.create(ref,{type:'invoice-email',paymentId,status:'pending',createdAt:new Date()});
 });
}
