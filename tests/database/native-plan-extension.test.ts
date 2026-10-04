import {randomBytes} from 'node:crypto';
import {NextRequest} from 'next/server';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {POST,GET} from '@/app/api/client-meal-plans/[id]/extend/route';
import {getServerSession} from 'next-auth';
jest.mock('next-auth',()=>({getServerSession:jest.fn()}));
jest.mock('@/lib/auth/config',()=>({authOptions:{}}));
jest.mock('@/lib/server/history',()=>({logHistoryServer:jest.fn()}));
jest.mock('@/lib/status/computeClientStatus',()=>({recalculateAndPersistClientStatus:jest.fn()}));
jest.mock('@/lib/cache/memoryCache',()=>({clearCacheByTag:jest.fn()}));
const suite=process.env.FIRESTORE_EMULATOR_HOST?describe:describe.skip;
suite('native plan extension',()=>{
 let db:ReturnType<typeof getNativeDatabase>;const refs:FirebaseFirestore.DocumentReference[]=[];
 beforeAll(()=>{db=getNativeDatabase();});
 afterAll(async()=>{for(const ref of refs)await ref.delete();await db.terminate();});
 const id=()=>randomBytes(12).toString('hex');
 async function put(collection:string,data:FirebaseFirestore.DocumentData){const ref=db.collection(collection).doc(id());refs.push(ref);await ref.set(data);return ref;}
 async function fixture(){
  const client=id();const purchase=await put('clientpurchases',{client,durationDays:90,remainingDays:70,selectedTier:{durationDays:90,extendDays:5},expectedEndDate:new Date('2026-12-31')});
  const plan=await put('clientmealplans',{clientId:client,purchaseId:purchase.id,status:'active',phaseNumber:1,startDate:new Date('2026-10-01'),endDate:new Date('2026-10-10'),duration:10});
  const next=await put('clientmealplans',{clientId:client,purchaseId:purchase.id,status:'active',phaseNumber:2,startDate:new Date('2026-10-11'),endDate:new Date('2026-10-20'),meals:[{date:new Date('2026-10-11'),items:['preserved']}]});
  return {purchase,plan,next};
 }
 function request(days:number){return new NextRequest('http://localhost/api/extend',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({extendDays:days})});}
 beforeEach(async()=>{const actor=await put('users',{role:'admin',status:'active'});(getServerSession as jest.Mock).mockResolvedValue({user:{id:actor.id,role:'admin'}});});
 it('updates allocation and linked phase dates together and preserves meal contents',async()=>{
  const {purchase,plan,next}=await fixture();const response=await POST(request(2),{params:Promise.resolve({id:plan.id})});
  expect(response.status).toBe(200);expect((await purchase.get()).get('remainingDays')).toBe(72);
  expect((await purchase.get()).get('extendedDaysUsed')).toBe(2);
  expect((await plan.get()).get('endDate').toDate()).toEqual(new Date('2026-10-12'));
  expect((await next.get()).get('startDate').toDate()).toEqual(new Date('2026-10-13'));
  expect((await next.get()).get('meals')[0].items).toEqual(['preserved']);
 });
 it('rejects fractional days and an unassigned staff member without changing dates',async()=>{
  const {plan}=await fixture();expect((await POST(request(1.5),{params:Promise.resolve({id:plan.id})})).status).toBe(400);
  (getServerSession as jest.Mock).mockResolvedValue({user:{id:id(),role:'dietitian'}});
  expect((await POST(request(1),{params:Promise.resolve({id:plan.id})})).status).toBe(403);
  expect((await GET(new NextRequest('http://localhost/api/extend'),{params:Promise.resolve({id:plan.id})})).status).toBe(403);
  expect((await plan.get()).get('endDate').toDate()).toEqual(new Date('2026-10-10'));
 });
 it('does not consume extension quota twice during concurrent requests',async()=>{
  const {purchase,plan}=await fixture();
  const responses=await Promise.all([POST(request(4),{params:Promise.resolve({id:plan.id})}),POST(request(4),{params:Promise.resolve({id:plan.id})})]);
  expect(responses.filter(r=>r.status===200)).toHaveLength(1);
  expect([400,409]).toContain(responses.find(r=>r.status!==200)!.status);
  expect((await purchase.get()).get('extendedDaysUsed')).toBe(4);
 });
});
