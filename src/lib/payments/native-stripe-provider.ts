import Stripe from 'stripe';
import {NativeCheckoutError} from '@/lib/db/repository/native-checkout';
export function nativeStripe(){const key=process.env.STRIPE_SECRET_KEY;if(!key)throw new NativeCheckoutError('Stripe is not configured',503);if(process.env.NODE_ENV!=='production'&&!key.startsWith('sk_test_'))throw new NativeCheckoutError('Live Stripe operations are disabled during local validation',409);return new Stripe(key,{apiVersion:'2025-08-27.basil'});}
export function nativeStripeProvider(){const stripe=nativeStripe();return {create:(data:any,key:string)=>stripe.paymentIntents.create(data,{idempotencyKey:key}),retrieve:(id:string)=>stripe.paymentIntents.retrieve(id)};}
