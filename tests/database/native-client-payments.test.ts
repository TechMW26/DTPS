import {randomBytes} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/database';
import {nativeClientReceipt,nativeClientPayments} from '@/lib/db/repository/native-client-payments';
import {createNativePurchaseRequest} from '@/lib/db/repository/native-purchase-requests';
const suite=process.env.DTPS_MONGODB_LOCAL_TEST?describe:describe.skip;
suite('native client payments and purchase interest',()=>{
 let db:ReturnType<typeof getNativeDatabase>;const refs:FirebaseFirestore.DocumentReference[]=[];
 beforeAll(()=>{db=getNativeDatabase();});afterAll(async()=>{for(const ref of refs)await ref.delete();await db.terminate();});
 const id=()=>randomBytes(12).toString('hex');
 async function put(collection:string,data:Record<string,unknown>){const ref=db.collection(collection).doc(id());refs.push(ref);await ref.set(data);return ref;}
 it('isolates receipts and exposes the paid amount without internal payment fields',async()=>{
  const client=await put('users',{firstName:'Synthetic',password:'private'}),other=id();
  const payment=await put('unifiedpayments',{client:client.id,amount:100,finalAmount:80,internalNote:'private',expectedEndDate:new Date('2026-12-01'),createdAt:new Date(),status:'paid'});
  expect(await nativeClientReceipt(db,other,{paymentId:payment.id})).toBeNull();
  const receipt=await nativeClientReceipt(db,client.id,{paymentId:payment.id});expect(receipt?.amount).toBe(80);expect((receipt?.client as any).password).toBeUndefined();
  const rows=await nativeClientPayments(db,client.id);expect(rows[0].internalNote).toBeUndefined();expect(rows[0].expectedEndDate.toISOString()).toBe('2026-12-01T00:00:00.000Z');
 });
 it('uses current server pricing and permits only one concurrent pending request',async()=>{
  const client=await put('users',{role:'client'}),tier=id(),plan=await put('serviceplans',{isActive:true,showToClients:true,name:'Synthetic',category:'test',pricingTiers:[{_id:tier,isActive:true,amount:100,durationDays:30,durationLabel:'1 Month'}]});
  const results=await Promise.allSettled([1,2].map(()=>createNativePurchaseRequest(db,client.id,{servicePlanId:plan.id,pricingTierId:tier,amount:1})));
  expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(1);
  for(const result of results)if(result.status==='fulfilled'){expect(result.value.amount).toBe(100);refs.push(db.collection('purchaserequests').doc(result.value._id));}
 });
});
