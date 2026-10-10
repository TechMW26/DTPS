import type * as MongoTypes from '@/lib/db/mongo-types';
import {randomBytes} from 'node:crypto';
import {NextRequest} from 'next/server';
import {getNativeDatabase} from '@/lib/db/database';
import {GET} from '@/app/api/client/service-plans/route';
jest.mock('@/lib/db/repository/native-client-services',()=>({...jest.requireActual('@/lib/db/repository/native-client-services'),nativeServiceCatalog:jest.fn(()=>{throw new Error('Summary must not load catalog');})}));
import {nativeUserClientList} from '@/lib/db/repository/native-user-client-list';
import {getServerSession} from 'next-auth';
jest.mock('next-auth',()=>({getServerSession:jest.fn()}));
jest.mock('@/lib/auth/config',()=>({authOptions:{}}));
jest.mock('@/lib/server/history',()=>({logHistoryServer:jest.fn()}));
jest.mock('@/lib/utils/activityLogger',()=>({logActivity:jest.fn(async()=>{})}));
jest.mock('@/lib/auth/onboarding-access',()=>({grantDietPlanAccess:jest.fn()}));
jest.mock('@/lib/firebase/firebaseNotification',()=>({sendNotificationToUser:jest.fn()}));

jest.mock('@/lib/cache/memoryCache',()=>({clearCacheByTag:jest.fn()}));
const suite=process.env.DTPS_MONGODB_LOCAL_TEST?describe:describe.skip;
suite('ported purchased duration and client history regressions',()=>{
 let db:ReturnType<typeof getNativeDatabase>;const refs:MongoTypes.DocumentReference[]=[];
 const id=()=>randomBytes(12).toString('hex');
 beforeAll(()=>{db=getNativeDatabase();});afterAll(async()=>{for(const ref of refs)await ref.delete();await db.terminate();});
 async function put(collection:string,data:any){const ref=db.collection(collection).doc(id());refs.push(ref);await ref.set(data);return ref;}
 it('returns purchased three-month expiry separately from the ten-day current phase without catalog reads',async()=>{
  const staff=await put('users',{role:'dietitian',status:'active'}),client=await put('users',{role:'client',status:'active',assignedDietitian:staff.id});
  const start=new Date();start.setHours(0,0,0,0);const phaseEnd=new Date(start);phaseEnd.setDate(phaseEnd.getDate()+9);const expiry=new Date(start);expiry.setMonth(expiry.getMonth()+3);
  const purchase=await put('unifiedpayments',{client:client.id,dietitian:staff.id,planName:'Weight Loss',durationDays:90,durationLabel:'3 Months',status:'paid',paymentStatus:'paid',expectedStartDate:start,expectedEndDate:expiry,createdAt:start});
  await put('clientmealplans',{clientId:client.id,dietitianId:staff.id,purchaseId:purchase.id,name:'Current detox',startDate:start,endDate:phaseEnd,duration:10,status:'active'});
  const future=new Date(phaseEnd);future.setDate(future.getDate()+1);await put('clientmealplans',{clientId:client.id,dietitianId:staff.id,purchaseId:purchase.id,name:'Next phase',startDate:future,endDate:expiry,duration:20,status:'active'});
  (getServerSession as jest.Mock).mockResolvedValue({user:{id:client.id,role:'client'}});
  const response=await GET(new NextRequest('http://localhost/api/client/service-plans?summary=true'));expect(response.status).toBe(200);const body=await response.json();expect(body.activePurchases[0]).toMatchObject({durationLabel:'3 Months',durationDays:90,expectedEndDate:expiry.toISOString(),ongoingMealPlanDuration:10,mealPlanName:'Current detox'});expect(body.nextMealPlan.name).toBe('Next phase');
 });
 it('applies computed active status before pagination without including another staff member’s clients',async()=>{
  const staff=await put('users',{role:'dietitian',status:'active'});for(let i=0;i<6;i++){const client=await put('users',{role:'client',status:'active',firstName:`Page${i}`,assignedDietitian:staff.id,clientStatus:'inactive'});await put('unifiedpayments',{client:client.id,status:'paid',paymentStatus:'paid',expectedEndDate:new Date('2099-01-01')});}
  const other=await put('users',{role:'client',status:'active',firstName:'Other',assignedDietitian:id()});await put('unifiedpayments',{client:other.id,status:'paid',paymentStatus:'paid',expectedEndDate:new Date('2099-01-01')});
  const result=await nativeUserClientList(db,staff.id,new URLSearchParams({status:'active',limit:'2',page:'2'}));expect(result.pagination).toMatchObject({total:6,page:2,limit:2,pages:3});expect(result.clients.map((c:any)=>c.firstName)).toEqual(['Page2','Page3']);expect(result.clients.every((c:any)=>c.clientStatus==='active')).toBe(true);
 });
 it('keeps the authoritative purchase and its upcoming phase over an imported stale duplicate',async()=>{
  const staff=await put('users',{role:'dietitian',status:'active'}),client=await put('users',{role:'client',status:'active',assignedDietitian:staff.id});const now=new Date(),start=new Date(Date.now()+12*86400000),end=new Date(start.getTime()+9*86400000),expiry=new Date(start.getTime()+90*86400000);
  const common={client:client.id,dietitian:staff.id,planName:'Weight Loss',durationDays:90,durationLabel:'3 Months',finalAmount:5000,amount:5000,status:'paid',paymentStatus:'paid',startDate:now,endDate:expiry,expectedStartDate:start,expectedEndDate:expiry,createdAt:now};
  await put('unifiedpayments',{...common,daysUsed:0,remainingDays:90,mealPlanCreated:false});const purchase=await put('unifiedpayments',{...common,daysUsed:10,remainingDays:80,mealPlanCreated:true});const plan=await put('clientmealplans',{clientId:client.id,dietitianId:staff.id,purchaseId:purchase.id,status:'active',name:'Future phase',startDate:start,endDate:end,duration:10});
  (getServerSession as jest.Mock).mockResolvedValue({user:{id:client.id,role:'client'}});const response=await GET(new NextRequest('http://localhost/api/client/service-plans?summary=true'));expect(response.status).toBe(200);const body=await response.json();expect(body.activePurchases).toHaveLength(1);expect(body.activePurchases[0]._id).toBe(purchase.id);expect(body.nextMealPlan.id).toBe(plan.id);
 });

});
