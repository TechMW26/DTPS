import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth';
import {getNativeDatabase} from '@/lib/db/database';
import {verifyNativePaymentLink} from '@/lib/db/repository/native-payment-link';
import {NativeCheckoutError} from '@/lib/db/repository/native-checkout';
import {nativeFetchPaymentLink} from '@/lib/payments/native-provider';
export async function POST(request:NextRequest){
 try{const session=await getServerSession(authOptions);if(!session?.user?.id)return nativeResponseJson({error:'Unauthorized'},{status:401});
 const input=await request.json(),result=await verifyNativePaymentLink(getNativeDatabase(),session.user.id,input.razorpayPaymentLinkId,nativeFetchPaymentLink);
 return nativeResponseJson({success:true,message:'Payment verified successfully',payment:{_id:result.payment._id,status:result.payment.status,paymentStatus:result.payment.paymentStatus,planName:result.payment.planName,amount:result.payment.amount,paidAt:result.payment.paidAt}});
 }catch(error){return nativeResponseJson({error:error instanceof NativeCheckoutError?error.message:'Payment link verification temporarily unavailable'},{status:error instanceof NativeCheckoutError?error.status:503});}
}
