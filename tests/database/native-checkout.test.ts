import type * as MongoTypes from '@/lib/db/mongo-types';
import {createHmac,randomBytes} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/database';
import {createNativeCheckout,verifyNativeCheckout,type CheckoutProvider} from '@/lib/db/repository/native-checkout';
const suite=process.env.DTPS_MONGODB_LOCAL_TEST?describe:describe.skip;
suite('native checkout integrity',()=>{
 let db:ReturnType<typeof getNativeDatabase>;const refs:MongoTypes.DocumentReference[]=[];const secret='synthetic-test-secret';
 beforeAll(()=>{db=getNativeDatabase();});afterAll(async()=>{for(const ref of refs)await ref.delete();await db.terminate();});
 const id=()=>randomBytes(12).toString('hex');
 async function setup(){const user=db.collection('users').doc(id()),plan=db.collection('serviceplans').doc(id()),tier=id();refs.push(user,plan);await user.set({role:'client',status:'active'});await plan.set({isActive:true,showToClients:true,name:'Synthetic plan',pricingTiers:[{_id:tier,isActive:true,amount:100,durationDays:30}]});return {user,plan,tier};}
 function provider(){const orders:any[]=[];let captured:any;const api:CheckoutProvider={createOrder:jest.fn(async data=>{const order={...data,id:'order_'+id()};orders.push(order);return order;}),findOrders:jest.fn(async receipt=>orders.filter(order=>order.receipt===receipt)),fetchPayment:jest.fn(async()=>captured)};return {api,setPayment:(payment:any)=>{captured=payment;}};}
 function verification(order:string,payment:string){return {razorpay_order_id:order,razorpay_payment_id:payment,razorpay_signature:createHmac('sha256',secret).update(order+'|'+payment).digest('hex')};}
 it('uses database prices and reuses a completed checkout on retry',async()=>{
  const {user,plan,tier}=await setup(),mock=provider(),key=id(),input={planId:plan.id,tierId:tier,amount:1};
  const payment=await createNativeCheckout(db,user.id,'service_plan',input,key,mock.api);refs.push(db.collection('unifiedpayments').doc(payment._id));
  const retry=await createNativeCheckout(db,user.id,'service_plan',input,key,mock.api);
  expect(payment.amount).toBe(100);expect(retry.razorpayOrderId).toBe(payment.razorpayOrderId);expect(mock.api.createOrder).toHaveBeenCalledTimes(1);
 });
 it('recovers an uncertain provider response without creating another order',async()=>{
  const {user,plan,tier}=await setup(),mock=provider(),key=id(),input={planId:plan.id,tierId:tier};
  const realCreate=mock.api.createOrder;mock.api.createOrder=async data=>{await realCreate(data);throw new Error('Connection interrupted after provider accepted');};
  await expect(createNativeCheckout(db,user.id,'service_plan',input,key,mock.api)).rejects.toMatchObject({status:503});
  const recovered=await createNativeCheckout(db,user.id,'service_plan',input,key,mock.api);refs.push(db.collection('unifiedpayments').doc(recovered._id));expect(realCreate).toHaveBeenCalledTimes(1);
 });
 it('requires owner, capture, amount, currency and signature before granting entitlement',async()=>{
  const {user,plan,tier}=await setup(),mock=provider();
  const payment=await createNativeCheckout(db,user.id,'service_plan',{planId:plan.id,tierId:tier},id(),mock.api);refs.push(db.collection('unifiedpayments').doc(payment._id));
  const payId='pay_'+id(),input=verification(payment.razorpayOrderId,payId),proof={id:payId,order_id:payment.razorpayOrderId,status:'captured',captured:true,amount:10000,currency:'INR'};
  mock.setPayment(proof);await expect(verifyNativeCheckout(db,id(),input,secret,mock.api)).rejects.toMatchObject({status:404});
  await expect(verifyNativeCheckout(db,user.id,{...input,razorpay_signature:'0'.repeat(64)},secret,mock.api)).rejects.toMatchObject({status:400});
  mock.setPayment({...proof,amount:1});await expect(verifyNativeCheckout(db,user.id,input,secret,mock.api)).rejects.toMatchObject({status:409});
  mock.setPayment({...proof,status:'authorized',captured:false});await expect(verifyNativeCheckout(db,user.id,input,secret,mock.api)).rejects.toMatchObject({status:409});
  mock.setPayment(proof);const results=await Promise.all([verifyNativeCheckout(db,user.id,input,secret,mock.api),verifyNativeCheckout(db,user.id,input,secret,mock.api)]);
  refs.push(db.collection('_nativeRazorpayPayments').doc(payId),db.collection('_nativeOutbox').doc('payment-paid-'+payment._id));
  expect(results.filter(result=>result.created)).toHaveLength(1);const paid=results[0].payment;expect(paid.remainingDays).toBe(30);expect(paid.endDate.getTime()-paid.startDate.getTime()).toBe(29*86400000);
 });
});
