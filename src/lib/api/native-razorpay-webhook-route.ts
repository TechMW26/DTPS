import {NextRequest,NextResponse} from 'next/server';
import {getNativeDatabase} from '@/lib/db/database';
import {validNativeWebhookSignature,processNativeRazorpayWebhook,nativeWebhookHash} from '@/lib/db/repository/native-razorpay-webhook';
import {NativeCheckoutError} from '@/lib/db/repository/native-checkout';
import {nativeFetchPaymentLink} from '@/lib/payments/native-provider';
export async function POST(request:NextRequest){try{
 const secret=process.env.RAZORPAY_WEBHOOK_SECRET;if(!secret)return NextResponse.json({error:'Webhook not configured'},{status:503});
 if(process.env.NODE_ENV!=='production'&&!process.env.RAZORPAY_KEY_ID?.startsWith('rzp_test_'))return NextResponse.json({error:'Live webhooks are disabled during local migration testing'},{status:409});
 const body=await request.text();if(Buffer.byteLength(body)>1024*1024)return NextResponse.json({error:'Payload too large'},{status:413});
 if(!validNativeWebhookSignature(body,request.headers.get('x-razorpay-signature')||'',secret))return NextResponse.json({error:'Invalid signature'},{status:401});
 await processNativeRazorpayWebhook(getNativeDatabase(),JSON.parse(body),nativeWebhookHash(body),nativeFetchPaymentLink);return NextResponse.json({success:true,received:true});
 }catch(error){return NextResponse.json({error:error instanceof SyntaxError?'Invalid webhook payload':'Webhook processing requires retry'},{status:error instanceof SyntaxError?400:503});}}
export async function GET(){return NextResponse.json({status:'active',provider:'razorpay'});}
