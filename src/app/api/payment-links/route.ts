import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/database';
import {createNativeStaffPaymentLink,listNativeStaffPaymentLinks,cancelNativeStaffPaymentLink} from '@/lib/db/repository/native-payment-link-admin';
import {NativeCheckoutError} from '@/lib/db/repository/native-checkout';
import {nativeFetchPaymentLink,nativePaymentLinkProvider} from '@/lib/payments/native-provider';
async function actor(){const session=await getServerSession(authOptions);if(!session?.user?.id)throw new NativeCheckoutError('Unauthorized',401);return session.user.id;}
function failure(error:unknown){return nativeResponseJson({error:error instanceof NativeCheckoutError?error.message:'Payment link service unavailable'},{status:error instanceof NativeCheckoutError?error.status:error instanceof SyntaxError?400:503,headers:{'Cache-Control':'no-store'}});}
export async function GET(request:NextRequest){try{return nativeResponseJson(await listNativeStaffPaymentLinks(getNativeDatabase(),await actor(),request.nextUrl.searchParams,nativeFetchPaymentLink),{headers:{'Cache-Control':'no-store'}});}catch(error){return failure(error);}}
export async function POST(request:NextRequest){try{const id=await actor(),paymentLink=await createNativeStaffPaymentLink(getNativeDatabase(),id,await request.json(),request.headers.get('Idempotency-Key'),nativePaymentLinkProvider(),new URL('/payment/success',process.env.NEXTAUTH_URL||'http://localhost:3087').href);return nativeResponseJson({success:true,paymentLink,message:'Payment link created with Razorpay'},{status:201});}catch(error){return failure(error);}}
export async function DELETE(request:NextRequest){try{await cancelNativeStaffPaymentLink(getNativeDatabase(),await actor(),request.nextUrl.searchParams.get('id')||'',nativePaymentLinkProvider());return nativeResponseJson({success:true,message:'Payment link cancelled'});}catch(error){return failure(error);}}
