import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {createNativeCheckout,verifyNativeCheckout,NativeCheckoutError} from '@/lib/db/repository/native-checkout';
import {nativeCheckoutProvider} from '@/lib/payments/native-provider';
export function nativePurchaseRoute(kind:'service_plan'|'subscription'){
 return async(request:NextRequest)=>{try{
  const session=await getServerSession(authOptions);if(!session?.user?.id)return NextResponse.json({error:'Unauthorized'},{status:401});
  const provider=nativeCheckoutProvider(),payment=await createNativeCheckout(getNativeDatabase(),session.user.id,kind,await request.json(),request.headers.get('x-idempotency-key'),provider);
  return NextResponse.json({success:true,provider:'razorpay_checkout',keyId:process.env.RAZORPAY_KEY_ID,orderId:payment.razorpayOrderId,paymentId:payment._id,amount:Math.round(payment.finalAmount*100),currency:payment.currency,name:'DTPS',description:`${payment.planName} - ${payment.durationLabel}`,prefill:{name:payment.payerName,email:payment.payerEmail,contact:String(payment.payerPhone||'').replace(/[^\d+]/g,'')}});
 }catch(error){return NextResponse.json({error:error instanceof NativeCheckoutError?error.message:'Checkout temporarily unavailable'},{status:error instanceof NativeCheckoutError?error.status:503});}};
}
export async function nativeVerifyRoute(request:NextRequest){
 try{const session=await getServerSession(authOptions);if(!session?.user?.id)return NextResponse.json({error:'Unauthorized'},{status:401});
 const provider=nativeCheckoutProvider(),result=await verifyNativeCheckout(getNativeDatabase(),session.user.id,await request.json(),process.env.RAZORPAY_KEY_SECRET||'',provider);
 return NextResponse.json({success:true,message:'Payment verified successfully',paymentId:result.payment._id,status:'completed',payment:{_id:result.payment._id,status:result.payment.status,paymentStatus:result.payment.paymentStatus,planName:result.payment.planName,amount:result.payment.amount,paidAt:result.payment.paidAt}});
 }catch(error){return NextResponse.json({error:error instanceof NativeCheckoutError?error.message:'Payment verification temporarily unavailable'},{status:error instanceof NativeCheckoutError?error.status:503});}
}
