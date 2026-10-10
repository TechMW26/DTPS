import type * as MongoTypes from '@/lib/db/mongo-types';
import {NativePlanEditor} from '@/lib/db/repository/native-plan-editor';
import {randomBytes} from 'node:crypto';
import {NextRequest} from 'next/server';
import {getNativeDatabase} from '@/lib/db/database';
import {PUT,GET,DELETE} from '@/app/api/client-meal-plans/[id]/route';
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
suite('ported published-plan lifecycle protections',()=>{
 let db:ReturnType<typeof getNativeDatabase>;const refs:MongoTypes.DocumentReference[]=[];
 const id=()=>randomBytes(12).toString('hex');
 beforeAll(()=>{db=getNativeDatabase();});afterAll(async()=>{for(const ref of refs)await ref.delete();await db.terminate();});
 async function fixture(status='draft',extra:any={}){const actor=db.collection('users').doc(id()),client=db.collection('users').doc(id()),plan=db.collection('clientmealplans').doc(id());refs.push(actor,client,plan);await actor.set({role:'admin'});await client.set({role:'client'});await plan.set({clientId:client.id,dietitianId:actor.id,status,name:'Original',startDate:new Date('2099-01-01'),endDate:new Date('2099-01-10'),duration:10,meals:[{date:'2099-01-01',meals:{BREAKFAST:{foodOptions:[{food:'Oats'}]}}}],...extra});(getServerSession as jest.Mock).mockResolvedValue({user:{id:actor.id,role:'admin'}});return plan;}
 const request=(body:any,key?:string)=>new NextRequest('http://localhost/api/client-meal-plans/x',{method:'PUT',headers:{'content-type':'application/json',...(key?{'x-idempotency-key':key}:{})},body:JSON.stringify(body)});
 const context=(id:string)=>({params:Promise.resolve({id})});
 it('publishes once and preserves the first publication on a retry',async()=>{const plan=await fixture(),key=id();const first=await PUT(request({status:'active'},key),context(plan.id));expect(first.status).toBe(200);const before=(await plan.get()).data()!;expect(before.firstPublishedAt).toBeTruthy();expect((await PUT(request({status:'active'},key),context(plan.id))).status).toBe(200);const after=(await plan.get()).data()!;expect(after.firstPublishedAt).toEqual(before.firstPublishedAt);expect(after.republishCount).toBe(1);});
 it.each([['active','draft'],['paused','draft'],['completed','draft'],['cancelled','draft'],['completed','active'],['completed','paused'],['completed','cancelled'],['cancelled','active'],['cancelled','paused'],['cancelled','completed'],['draft','paused'],['draft','completed'],['draft','cancelled']])('blocks forbidden %s to %s transitions',async(from,to)=>{const plan=await fixture(from);expect((await PUT(request({status:to}),context(plan.id))).status).toBe(409);expect((await plan.get()).get('status')).toBe(from);});
 it('keeps published identity and date locked while allowing meal content updates',async()=>{const plan=await fixture('active');expect((await PUT(request({name:'Replacement'}),context(plan.id))).status).toBe(409);expect((await PUT(request({startDate:'2099-01-02'}),context(plan.id))).status).toBe(409);expect((await PUT(request({description:'Updated notes'}),context(plan.id))).status).toBe(200);expect((await plan.get()).get('name')).toBe('Original');});
 it('cannot publish empty food slots or missing imported dates',async()=>{const empty=await fixture('draft',{meals:[]});expect((await PUT(request({status:'active'}),context(empty.id))).status).toBe(400);const invalid=await fixture('draft',{startDate:null,endDate:null});const result=await PUT(request({status:'active'}),context(invalid.id));expect(result.status).toBe(409);expect((await result.json()).code).toBe('PLAN_DATES_NEED_CORRECTION');expect((await invalid.get()).get('status')).toBe('draft');});
 it('rejects null date input and unauthenticated reads, writes and deletion',async()=>{const plan=await fixture();expect((await PUT(request({startDate:null}),context(plan.id))).status).toBe(400);(getServerSession as jest.Mock).mockResolvedValue(null);expect((await PUT(request({description:'No'}),context(plan.id))).status).toBe(401);expect((await GET(new NextRequest('http://localhost/api/plan'),context(plan.id))).status).toBe(401);expect((await DELETE(new NextRequest('http://localhost/api/plan',{method:'DELETE'}),context(plan.id))).status).toBe(401);});
 it.each([['draft','active'],['active','paused'],['active','completed'],['active','cancelled'],['paused','active'],['paused','completed'],['paused','cancelled']])('allows %s to %s',async(from,to)=>{const plan=await fixture(from);expect((await PUT(request({status:to,statusReason:'Confirmed request'}),context(plan.id))).status).toBe(200);expect((await plan.get()).get('status')).toBe(to);});
 it('keeps publish metadata across pause/resume, trims title checks and records denied transitions',async()=>{const first=new Date('2026-01-01'),plan=await fixture('active',{firstPublishedAt:first});expect((await PUT(request({name:' Original ',status:'active'}),context(plan.id))).status).toBe(200);expect((await PUT(request({status:'paused'}),context(plan.id))).status).toBe(200);expect((await PUT(request({status:'active'}),context(plan.id))).status).toBe(200);expect((await plan.get()).get('firstPublishedAt').toDate()).toEqual(first);expect((await PUT(request({status:'draft'}),context(plan.id))).status).toBe(409);expect((await plan.get()).get('lifecycleAudit').length).toBeGreaterThan(2);});
 it('requires a cancellation reason and ignores published duration changes',async()=>{const plan=await fixture('active');expect((await PUT(request({status:'cancelled',statusReason:'  '}),context(plan.id))).status).toBe(400);expect((await PUT(request({duration:20}),context(plan.id))).status).toBe(200);expect((await plan.get()).get('duration')).toBe(10);const draft=await fixture();expect((await PUT(request({duration:20}),context(draft.id))).status).toBe(200);expect((await draft.get()).get('duration')).toBe(20);});
 it('rejects concurrent publication or content changes without overwriting them',async()=>{
  for(const originalStatus of ['draft','active']){const plan=await fixture(originalStatus),original=NativePlanEditor.prototype.plan;const spy=jest.spyOn(NativePlanEditor.prototype,'plan').mockImplementationOnce(async function(this:NativePlanEditor,key:string){const loaded=await original.call(this,key);await plan.update({status:'active',description:'Concurrent saved work'});return loaded;});
   const response=await PUT(request({description:'Stale editor'}),context(plan.id));spy.mockRestore();expect(response.status).toBe(409);expect((await plan.get()).get('description')).toBe('Concurrent saved work');
  }
 });
 it.each([false,true])('preserves frozen recovery content and metadata when supplied=%s',async(includeRecovery)=>{
  const meal=(date:string,food:string)=>({date,meals:{BREAKFAST:{foodOptions:[{food}]}}}),base=meal('2099-01-01','Oats'),recovery={...meal('2099-01-11','Recovery'),isFreezeRecovery:true,originalFreezeDate:'2099-01-01',originalFreezeDateLabel:'Day 1'};
  const plan=await fixture('draft',{meals:[base,recovery],endDate:new Date('2099-01-11'),freezedDays:[{date:'2099-01-01',addedDate:'2099-01-11'}]});
  expect((await PUT(request({status:'active',meals:[base,...(includeRecovery?[meal('2099-01-11','Edited')]:[])]}),context(plan.id))).status).toBe(200);const stored=(await plan.get()).get('meals');expect(stored.find((m:any)=>m.date==='2099-01-11')).toMatchObject({isFreezeRecovery:true,originalFreezeDate:'2099-01-01'});expect(stored.find((m:any)=>m.date==='2099-01-01').isFrozen).toBe(true);
 });

});
