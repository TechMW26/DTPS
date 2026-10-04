import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {verifyNativePaymentLink} from '@/lib/db/repository/native-payment-link';
import {nativePublicPaymentLink} from '@/lib/db/repository/native-invoices';
import {NativeCheckoutError} from '@/lib/db/repository/native-checkout';
import {nativeFetchPaymentLink} from '@/lib/payments/native-provider';
export async function POST(request:NextRequest){try{
 const {paymentLinkId}=await request.json();if(typeof paymentLinkId!=='string'||!/^plink_[a-zA-Z0-9]+$/.test(paymentLinkId))return nativeResponseJson({error:'Valid payment link ID is required'},{status:400});
 const db=getNativeDatabase(),rows=await db.collection('paymentlinks').where('razorpayPaymentLinkId','==',paymentLinkId).limit(2).get();
 if(rows.size!==1||!rows.docs[0].get('showToClient'))return nativeResponseJson({error:'Payment link not found'},{status:404});
 const owner=rows.docs[0].get('client');if(typeof owner!=='string'||!/^[a-f0-9]{24}$/i.test(owner))throw new NativeCheckoutError('Payment client requires reconciliation',409);
 // A browser-supplied payment ID/signature is never proof of a paid link.
 await verifyNativePaymentLink(db,owner,paymentLinkId,nativeFetchPaymentLink);
 return nativeResponseJson({success:true,paymentLink:await nativePublicPaymentLink(db,paymentLinkId),message:'Payment verified successfully'},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return nativeResponseJson({error:error instanceof NativeCheckoutError?error.message:'Unable to verify payment'},{status:error instanceof NativeCheckoutError?error.status:error instanceof SyntaxError?400:503,headers:{'Cache-Control':'no-store'}});}}
