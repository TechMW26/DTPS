import {randomBytes} from 'node:crypto';
import {NextRequest} from 'next/server';
import {getNativeDatabase} from '@/lib/db/database';
import {POST,GET} from '@/app/api/client-meal-plans/route';
import {getServerSession} from 'next-auth';
jest.mock('next-auth',()=>({getServerSession:jest.fn()}));
jest.mock('@/lib/auth/config',()=>({authOptions:{}}));
jest.mock('@/lib/server/history',()=>({logHistoryServer:jest.fn()}));
jest.mock('@/lib/utils/activityLogger',()=>({logActivity:jest.fn(async()=>{})}));
jest.mock('@/lib/auth/onboarding-access',()=>({grantDietPlanAccess:jest.fn()}));
jest.mock('@/lib/firebase/firebaseNotification',()=>({sendNotificationToUser:jest.fn()}));
jest.mock('@/lib/status/computeClientStatus',()=>({updateClientStatusFromMealPlan:jest.fn()}));
jest.mock('@/lib/cache/memoryCache',()=>({clearCacheByTag:jest.fn()}));
const suite=process.env.DTPS_MONGODB_LOCAL_TEST?describe:describe.skip;
suite('native plan creation and listing',()=>{
 let db:ReturnType<typeof getNativeDatabase>,actor:string;const refs:FirebaseFirestore.DocumentReference[]=[];
 const clients:string[]=[];
 beforeAll(()=>{db=getNativeDatabase();});
 afterAll(async()=>{for(const client of clients){const plans=await db.collection('clientmealplans').where('clientId','==',client).get();for(const plan of plans.docs)await plan.ref.delete();}for(const ref of refs)await ref.delete();await db.terminate();});
 const id=()=>randomBytes(12).toString('hex');
 async function put(collection:string,data:FirebaseFirestore.DocumentData){const ref=db.collection(collection).doc(id());refs.push(ref);await ref.set(data);return ref;}
 async function fixture(){
  const client=await put('users',{role:'client',firstName:'Synthetic',password:'never expose',fcmTokens:['never expose']});clients.push(client.id);
  const purchase=await put('unifiedpayments',{client:client.id,durationDays:90,remainingDays:90,paymentStatus:'paid',expectedStartDate:new Date('2099-10-01'),expectedEndDate:new Date('2099-12-31')});
  const data={clientId:client.id,purchaseId:purchase.id,name:'Synthetic phase',startDate:'2099-10-01',endDate:'2099-10-10',duration:10,status:'active',meals:[{date:'2099-10-01',meals:{breakfast:{foodOptions:[{food:'Test oats'}]}}}]};return {client,purchase,data};
 }
 const request=(body:unknown,key=id())=>new NextRequest('http://localhost/api/client-meal-plans',{method:'POST',headers:{'content-type':'application/json','x-idempotency-key':key},body:JSON.stringify(body)});
 beforeEach(async()=>{actor=id();const actorRef=db.collection('users').doc(actor);refs.push(actorRef);await actorRef.set({role:'admin',status:'active'});(getServerSession as jest.Mock).mockResolvedValue({user:{id:actor,role:'admin'}});});
 it('publishes once, allocates days once and returns the same plan on retry',async()=>{
  const {data,purchase}=await fixture(),key=id();const first=await POST(request(data,key));expect(first.status).toBe(201);
  const created=await first.json();expect(created.mealPlan.firstPublishedAt).toBeTruthy();expect(created.mealPlan.clientId.password).toBeUndefined();
  expect((await purchase.get()).get('remainingDays')).toBe(80);
  const retry=await POST(request(data,key));expect(retry.status).toBe(200);expect((await retry.json()).mealPlan._id).toBe(created.mealPlan._id);
  expect((await purchase.get()).get('daysUsed')).toBe(10);
 });
 it('does not publish two overlapping phases in simultaneous requests',async()=>{
  const {data,purchase}=await fixture();const results=await Promise.all([POST(request(data)),POST(request(data))]);
  expect(results.filter(r=>r.status===201)).toHaveLength(1);expect(results.find(r=>r.status!==201)?.status).toBe(409);
  expect((await purchase.get()).get('remainingDays')).toBe(80);
 });
 it('blocks client draft listing and unassigned creation',async()=>{
  const {data,client}=await fixture();expect((await POST(request({...data,status:'draft'}))).status).toBe(201);
  (getServerSession as jest.Mock).mockResolvedValue({user:{id:client.id,role:'client'}});
  const response=await GET(new NextRequest('http://localhost/api/client-meal-plans?status=draft'));expect(response.status).toBe(200);expect((await response.json()).mealPlans).toEqual([]);
  (getServerSession as jest.Mock).mockResolvedValue({user:{id:id(),role:'dietitian'}});
  expect((await POST(request({...data,status:'draft'}))).status).toBe(403);
 });
 it('rejects a purchase owned by another client without creating a plan',async()=>{
  const a=await fixture(),b=await fixture();expect((await POST(request({...a.data,purchaseId:b.purchase.id}))).status).toBe(400);
  expect((await db.collection('clientmealplans').where('clientId','==',a.client.id).get()).empty).toBe(true);
 });
});
