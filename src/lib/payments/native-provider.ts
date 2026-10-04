import Razorpay from 'razorpay';
import {NativeCheckoutError,type CheckoutProvider} from '@/lib/db/repository/native-checkout';
function nativeRazorpay(){
 const key=process.env.RAZORPAY_KEY_ID,secret=process.env.RAZORPAY_KEY_SECRET;
 if(!key||!secret)throw new NativeCheckoutError('Payment provider is not configured',503);
 if(process.env.NODE_ENV!=='production'&&!key.startsWith('rzp_test_'))throw new NativeCheckoutError('Live payment operations are disabled during local migration testing',503);
 return new Razorpay({key_id:key,key_secret:secret});
}
export function nativeCheckoutProvider():CheckoutProvider{
 const api=nativeRazorpay();
 return {createOrder:data=>api.orders.create(data as any),findOrders:async receipt=>(await api.orders.all({receipt,count:2} as any)).items,fetchPayment:id=>api.payments.fetch(id)};
}

export const nativeFetchPaymentLink = (id:string) => nativeRazorpay().paymentLink.fetch(id);

export function nativePaymentLinkProvider(){
 const api=nativeRazorpay();
 return {create:(data:Record<string,any>)=>api.paymentLink.create(data as any),find:async(reference:string)=>{const result:any=await api.paymentLink.all({reference_id:reference,count:2} as any);return result.payment_links||result.items||(result.id?[result]:[]);},cancel:(id:string)=>api.paymentLink.cancel(id)};
}

export function nativeFinanceSyncProvider(){const api=nativeRazorpay();return {fetchLink:(id:string)=>api.paymentLink.fetch(id),orderPayments:async(id:string)=>(await api.orders.fetchPayments(id)).items};}
