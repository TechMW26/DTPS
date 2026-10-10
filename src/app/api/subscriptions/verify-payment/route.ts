import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getNativeDatabase} from '@/lib/db/database';
import {nativeFinanceSession,nativeFinanceFailure} from '@/lib/api/native-finance-route';
import {verifyNativeSubscription} from '@/lib/db/repository/native-subscriptions';
import {nativeCheckoutProvider,nativeFetchPaymentLink} from '@/lib/payments/native-provider';
export async function POST(request:NextRequest){try{return nativeResponseJson({success:true,subscription:await verifyNativeSubscription(getNativeDatabase(),await nativeFinanceSession(),await request.json(),process.env.RAZORPAY_KEY_SECRET||'',nativeCheckoutProvider(),nativeFetchPaymentLink)});}catch(error){return nativeFinanceFailure(error);}}
