import {randomBytes} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/database';
import {nativeAdminStats} from '@/lib/db/repository/native-admin-stats';
const suite=process.env.DTPS_MONGODB_LOCAL_TEST?describe:describe.skip;
suite('native dashboard aggregates',()=>{
 let db:ReturnType<typeof getNativeDatabase>;const refs:FirebaseFirestore.DocumentReference[]=[];
 beforeAll(()=>{db=getNativeDatabase();});afterAll(async()=>{for(const ref of refs)await ref.delete();await db.terminate();});
 it('includes clients without commerce fields and keeps IST month boundaries',async()=>{
  const baseline=await nativeAdminStats(db,new Date('2090-02-10T12:00:00Z'));
  const client=db.collection('users').doc(randomBytes(12).toString('hex')),buyer=db.collection('users').doc(randomBytes(12).toString('hex'));refs.push(client,buyer);
  await client.set({role:'client'});await buyer.set({role:'client',wooCommerceData:{totalSpent:500,totalOrders:2,lastOrderDate:new Date('2090-01-31T20:00:00Z')}});
  const result=await nativeAdminStats(db,new Date('2090-02-10T12:00:00Z'));expect(result.totalClients-baseline.totalClients).toBe(2);expect(result.totalRevenue-baseline.totalRevenue).toBe(500);expect(result.monthlyRevenue-baseline.monthlyRevenue).toBe(500);expect(result.appointmentsByMonth.at(-1)?.revenue).toBe(500);
 });
 it('uses settled native payments for revenue when commerce totals are absent',async()=>{
  const client=db.collection('users').doc(randomBytes(12).toString('hex')),payment=db.collection('unifiedpayments').doc(randomBytes(12).toString('hex'));refs.push(client,payment);
  await client.set({role:'client'});await payment.set({client:client.id,status:'paid',paymentStatus:'paid',finalAmount:1250,currency:'INR',paidAt:new Date('2090-02-05T10:00:00Z'),createdAt:new Date('2090-02-05T10:00:00Z')});
  const result=await nativeAdminStats(db,new Date('2090-02-10T12:00:00Z'));expect(result.totalRevenue).toBe(1250);expect(result.monthlyRevenue).toBe(1250);expect(result.revenueBasis).toBe('unifiedpayments');
 });
});
