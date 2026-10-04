import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {nativeStripe} from '@/lib/payments/native-stripe-provider';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {settleNativeStripePayment} from '@/lib/db/repository/native-stripe-payments';
export async function POST(request:NextRequest){
 const secret=process.env.STRIPE_WEBHOOK_SECRET;if(!secret)return nativeResponseJson({error:'Stripe webhook is not configured'},{status:503});
 let event;try{const raw=await request.text();if(Buffer.byteLength(raw)>1048576)return nativeResponseJson({error:'Payload too large'},{status:413});event=nativeStripe().webhooks.constructEvent(raw,request.headers.get('stripe-signature')||'',secret);}catch{return nativeResponseJson({error:'Invalid webhook signature or unavailable local provider'},{status:400});}
 if(process.env.NODE_ENV!=='production'&&event.livemode)return nativeResponseJson({error:'Live events disabled during local validation'},{status:409});
 try{const db=getNativeDatabase(),ref=db.collection('_nativeWebhookEvents').doc('stripe-'+event.id);if((await ref.get()).exists)return nativeResponseJson({received:true});if(['payment_intent.succeeded','payment_intent.payment_failed','payment_intent.canceled'].includes(event.type))await settleNativeStripePayment(db,event.data.object);await ref.set({provider:'stripe',type:event.type,processedAt:new Date()});return nativeResponseJson({received:true});}catch{return nativeResponseJson({error:'Webhook processing unavailable; retry required'},{status:503});}
}
