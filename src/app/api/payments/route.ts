import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/database';
import {NativeCheckoutError} from '@/lib/db/repository/native-checkout';
import {listNativePayments,createNativeStripeConsultation,settleNativeStripePayment,linkNativePaymentPlan} from '@/lib/db/repository/native-stripe-payments';
import {nativeStripeProvider} from '@/lib/payments/native-stripe-provider';
async function actor(){const session=await getServerSession(authOptions);if(!session?.user?.id)throw new NativeCheckoutError('Unauthorized',401);return session.user.id;}
function fail(error:unknown){return nativeResponseJson({error:error instanceof NativeCheckoutError?error.message:'Payment service unavailable'},{status:error instanceof NativeCheckoutError?error.status:503});}
export async function GET(request:NextRequest){try{return nativeResponseJson(await listNativePayments(getNativeDatabase(),await actor(),request.nextUrl.searchParams),{headers:{'Cache-Control':'no-store'}});}catch(error){return fail(error);}}
export async function POST(request:NextRequest){try{return nativeResponseJson(await createNativeStripeConsultation(getNativeDatabase(),await actor(),await request.json(),request.headers.get('Idempotency-Key'),nativeStripeProvider()),{status:201});}catch(error){return fail(error);}}
export async function PUT(request:NextRequest){try{const id=await actor(),input=await request.json();if(!/^pi_[\w]+$/.test(input.paymentIntentId||''))throw new NativeCheckoutError('Invalid payment ID',400);const payment=await settleNativeStripePayment(getNativeDatabase(),await nativeStripeProvider().retrieve(input.paymentIntentId),id);return nativeResponseJson({success:true,payment});}catch(error){return fail(error);}}
export async function PATCH(request:NextRequest){try{return nativeResponseJson({success:true,payment:await linkNativePaymentPlan(getNativeDatabase(),await actor(),await request.json())});}catch(error){return fail(error);}}
