import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {nativeAuthorizedPaymentLink} from '@/lib/db/repository/native-payment-link-admin';
import {verifyNativePaymentLink} from '@/lib/db/repository/native-payment-link';
import {NativeCheckoutError} from '@/lib/db/repository/native-checkout';
import {nativeFetchPaymentLink} from '@/lib/payments/native-provider';
export async function POST(request:NextRequest){try{
 const session=await getServerSession(authOptions);if(!session?.user?.id)return nativeResponseJson({error:'Unauthorized'},{status:401});
 const {paymentLinkId}=await request.json(),db=getNativeDatabase(),link=await nativeAuthorizedPaymentLink(db,session.user.id,paymentLinkId,true);
 if(!link.razorpayPaymentLinkId)throw new NativeCheckoutError('Payment provider reference is missing',409);
 const proof=await nativeFetchPaymentLink(link.razorpayPaymentLinkId);
 if(proof.id!==link.razorpayPaymentLinkId)throw new NativeCheckoutError('Payment provider identity mismatch',409);
 if(proof.status==='paid')await verifyNativePaymentLink(db,link.client?._id,proof.id,async()=>proof);
 else if(['created','partially_paid','expired','cancelled'].includes(proof.status))await db.runTransaction(async tx=>{
  const ref=db.collection('paymentlinks').doc(paymentLinkId),current=await tx.get(ref);
  if(!current.exists||current.get('razorpayPaymentLinkId')!==proof.id)throw new NativeCheckoutError('Payment identity changed',409);
  if(current.get('status')==='paid')throw new NativeCheckoutError('Payment status conflict requires review',409);
  tx.update(ref,{status:proof.status==='created'||proof.status==='partially_paid'?'pending':proof.status,updatedAt:new Date()});
 });else throw new NativeCheckoutError('Unrecognized payment provider state',409);
 return nativeResponseJson({success:true,paymentLink:await nativeAuthorizedPaymentLink(db,session.user.id,paymentLinkId,true),message:'Payment status synchronized'},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return nativeResponseJson({error:error instanceof NativeCheckoutError?error.message:'Unable to synchronize payment'},{status:error instanceof NativeCheckoutError?error.status:error instanceof SyntaxError?400:503});}}
