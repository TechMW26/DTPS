import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getNativeDatabase} from '@/lib/db/database';
import {nativeFinanceSession,nativeFinanceFailure} from '@/lib/api/native-finance-route';
import {nativeSubscriptions,createNativeSubscription} from '@/lib/db/repository/native-subscriptions';
import {nativePaymentLinkProvider} from '@/lib/payments/native-provider';
export async function GET(request:NextRequest){try{const rows=await nativeSubscriptions(getNativeDatabase(),await nativeFinanceSession(),request.nextUrl.searchParams);return nativeResponseJson({success:true,subscriptions:rows,count:rows.length,...(request.nextUrl.searchParams.has('paymentId')?{subscription:rows[0]||null}:{})},{headers:{'Cache-Control':'no-store'}});}catch(error){return nativeFinanceFailure(error);}}
export async function POST(request:NextRequest){try{const actor=await nativeFinanceSession(),input=await request.json(),provider=input.generatePaymentLink&&input.paymentMethod==='razorpay'?nativePaymentLinkProvider():undefined;return nativeResponseJson({success:true,subscription:await createNativeSubscription(getNativeDatabase(),actor,input,request.headers.get('Idempotency-Key'),provider)},{status:201});}catch(error){return nativeFinanceFailure(error);}}
