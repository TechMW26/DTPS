import {randomBytes} from 'node:crypto';
import {NextRequest} from 'next/server';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {GET} from '@/app/api/client-meal-plans/route';
import {getServerSession} from 'next-auth';
jest.mock('next-auth',()=>({getServerSession:jest.fn()}));
jest.mock('@/lib/auth/config',()=>({authOptions:{}}));
jest.mock('@/lib/server/history',()=>({logHistoryServer:jest.fn()}));
jest.mock('@/lib/utils/activityLogger',()=>({logActivity:jest.fn(async()=>{})}));
jest.mock('@/lib/auth/onboarding-access',()=>({grantDietPlanAccess:jest.fn()}));
jest.mock('@/lib/firebase/firebaseNotification',()=>({sendNotificationToUser:jest.fn()}));
jest.mock('@/lib/status/computeClientStatus',()=>({updateClientStatusFromMealPlan:jest.fn()}));
jest.mock('@/lib/cache/memoryCache',()=>({clearCacheByTag:jest.fn()}));
const suite=process.env.FIRESTORE_EMULATOR_HOST?describe:describe.skip;
suite('PlanningSection client plan GET contract',()=>{
 let db:ReturnType<typeof getNativeDatabase>;const id=()=>randomBytes(12).toString('hex');
 beforeAll(()=>{db=getNativeDatabase();});afterAll(()=>db.terminate());
 it('accepts the exact status=all&limit=200 request and includes drafts plus published plans',async()=>{
  const actor=id(),client=id();await db.collection('users').doc(actor).set({role:'dietitian',status:'active'});await db.collection('users').doc(client).set({role:'client',assignedDietitian:actor});
  const ids=[];for(const status of ['draft','active','completed','paused','cancelled']){const key=id();ids.push(key);await db.collection('clientmealplans').doc(key).set({clientId:client,dietitianId:actor,status,name:status,createdAt:new Date(),startDate:new Date('2099-01-01'),endDate:new Date('2099-01-10'),meals:[]});}
  (getServerSession as jest.Mock).mockResolvedValue({user:{id:actor,role:'dietitian'}});
  const response=await GET(new NextRequest(`http://localhost:3087/api/client-meal-plans?clientId=${client}&status=all&limit=200`));expect(response.status).toBe(200);const body=await response.json();expect(body.success).toBe(true);expect(body.pagination).toMatchObject({limit:200,total:5});expect(body.mealPlans.map((plan:any)=>plan._id).sort()).toEqual(ids.sort());
  expect((await GET(new NextRequest(`http://localhost/api/client-meal-plans?clientId=${client}&status=all&limit=201`))).status).toBe(400);
  await db.collection('users').doc(client).update({assignedDietitian:id()});expect((await GET(new NextRequest(`http://localhost/api/client-meal-plans?clientId=${client}&status=all&limit=200`))).status).toBe(403);
 });
});
