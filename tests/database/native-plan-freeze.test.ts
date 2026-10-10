import {randomBytes} from 'node:crypto';
import {NextRequest} from 'next/server';
import {getNativeDatabase} from '@/lib/db/database';
import {POST,DELETE} from '@/app/api/client-meal-plans/[id]/freeze/route';
import {getServerSession} from 'next-auth';
jest.mock('next-auth',()=>({getServerSession:jest.fn()}));
jest.mock('@/lib/auth/config',()=>({authOptions:{}}));
jest.mock('@/lib/status/computeClientStatus',()=>({recalculateAndPersistClientStatus:jest.fn()}));
jest.mock('@/lib/cache/memoryCache',()=>({clearCacheByTag:jest.fn()}));
const suite=process.env.DTPS_MONGODB_LOCAL_TEST?describe:describe.skip;
suite('native plan freeze transactions',()=>{
 let db:ReturnType<typeof getNativeDatabase>;const refs:FirebaseFirestore.DocumentReference[]=[];
 beforeAll(()=>{db=getNativeDatabase();});
 afterAll(async()=>{for(const ref of refs)await ref.delete();await db.terminate();});
 const id=()=>randomBytes(12).toString('hex');
 async function put(collection:string,data:FirebaseFirestore.DocumentData){const ref=db.collection(collection).doc(id());refs.push(ref);await ref.set(data);return ref;}
 async function fixture(){
  const client=id();const purchase=await put('clientpurchases',{client,durationDays:90,remainingDays:70,selectedTier:{durationDays:90,freezeDays:1},expectedEndDate:new Date('2099-12-31T00:00:00+05:30')});
  const plan=await put('clientmealplans',{clientId:client,purchaseId:purchase.id,status:'active',phaseNumber:1,startDate:new Date('2099-10-01T00:00:00+05:30'),endDate:new Date('2099-10-10T00:00:00+05:30'),duration:10,meals:[{date:'2099-10-10',items:['original']}],freezedDays:[]});
  const next=await put('clientmealplans',{clientId:client,purchaseId:purchase.id,status:'active',phaseNumber:2,startDate:new Date('2099-10-11T00:00:00+05:30'),endDate:new Date('2099-10-20T00:00:00+05:30')});
  return {purchase,plan,next};
 }
 const request=(method:string,body:unknown)=>new NextRequest('http://localhost/api/freeze',{method,headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 beforeEach(async()=>{const actor=await put('users',{role:'admin',status:'active'});(getServerSession as jest.Mock).mockResolvedValue({user:{id:actor.id,role:'admin',name:'Test staff'}});});
 it.each([undefined, null, '', 'Client vacation'])('freezes and restores meals, phase dates and allowance with reason %p',async(reason)=>{
  const {plan,next,purchase}=await fixture();const context={params:Promise.resolve({id:plan.id})};
  expect((await POST(request('POST',{freezeDates:['2099-10-10','2099-10-10'],reason}),context)).status).toBe(200);
  expect((await plan.get()).get('freezedDays')[0].reason).toBe(reason || null);
  expect((await plan.get()).get('totalFreezeCount')).toBe(1);expect((await plan.get()).get('meals')).toHaveLength(2);
  expect((await next.get()).get('startDate').toDate()).toEqual(new Date('2099-10-12T00:00:00+05:30'));
  expect((await DELETE(request('DELETE',{unfreezeDates:['2099-10-10']}),context)).status).toBe(200);
  const restored=await plan.get();expect(restored.get('totalFreezeCount')).toBe(0);expect(restored.get('meals')).toEqual([{date:'2099-10-10',items:['original']}]);
  expect((await next.get()).get('startDate').toDate()).toEqual(new Date('2099-10-11T00:00:00+05:30'));
  expect((await purchase.get()).get('expectedEndDate').toDate()).toEqual(new Date('2099-12-31T00:00:00+05:30'));
 });
 it.each([42, {}, [], true, 'x'.repeat(2001)])('rejects invalid reason %# without modifying the plan',async(reason)=>{
  const {plan}=await fixture();
  const response=await POST(request('POST',{freezeDates:['2099-10-10'],reason}),{params:Promise.resolve({id:plan.id})});
  expect(response.status).toBe(400);
  expect((await plan.get()).get('freezedDays')).toEqual([]);
 });
 it('does not exceed a shared freeze allowance under concurrent requests',async()=>{
  const {plan,next}=await fixture();const responses=await Promise.all([
   POST(request('POST',{freezeDates:['2099-10-10']}),{params:Promise.resolve({id:plan.id})}),
   POST(request('POST',{freezeDates:['2099-10-11']}),{params:Promise.resolve({id:next.id})}),
  ]);expect(responses.filter(r=>r.status===200)).toHaveLength(1);
  expect([400,409]).toContain(responses.find(r=>r.status!==200)!.status);
  expect(((await plan.get()).get('totalFreezeCount')||0)+((await next.get()).get('totalFreezeCount')||0)).toBe(1);
 });
 it('rejects malformed dates and unassigned staff',async()=>{
  const {plan}=await fixture();const context={params:Promise.resolve({id:plan.id})};
  expect((await DELETE(request('DELETE',{unfreezeDates:['not-a-date']}),context)).status).toBe(400);
  (getServerSession as jest.Mock).mockResolvedValue({user:{id:id(),role:'dietitian'}});
  expect((await POST(request('POST',{freezeDates:['2099-10-10']}),context)).status).toBe(403);
  expect((await plan.get()).get('freezedDays')).toEqual([]);
 });
});
