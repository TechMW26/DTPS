import { candidateCacheDuration, reusableCandidates, type MealEngagementCandidates, type MealEngagementCandidateCache } from '@/lib/notifications/mealEngagementCandidates';
import {randomBytes} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {runMealEngagementNotifications,runNativeMealEngagementNotifications,getPlanMealSchedules} from '@/lib/notifications/mealEngagement';
const suite=process.env.FIRESTORE_EMULATOR_HOST?describe:describe.skip;
suite('native meal engagement scheduling',()=>{
 let db:ReturnType<typeof getNativeDatabase>;let user:FirebaseFirestore.DocumentReference,plan:FirebaseFirestore.DocumentReference;
 beforeAll(()=>{db=getNativeDatabase();});beforeEach(async()=>{user=db.collection('users').doc(randomBytes(12).toString('hex'));plan=db.collection('clientmealplans').doc(randomBytes(12).toString('hex'));await user.set({role:'client',notificationTimeZone:'Australia/Sydney'});await plan.set({clientId:user.id,status:'active',startDate:new Date('2026-09-30T00:00:00+05:30'),endDate:new Date('2026-09-30T23:59:59+05:30'),meals:[{date:new Date('2026-09-30T00:00:00+05:30'),meals:{DINNER:{time:'07:00 PM',foods:[{name:'Synthetic meal'}]}}}]});});
 afterEach(async()=>{await user.delete();await plan.delete();for(const row of(await db.collection('mealengagementdispatches').where('mealPlanId','==',plan.id).get()).docs)await row.ref.delete();});afterAll(async()=>{await db.terminate();});
 it('uses the client timezone and claims one delivery under concurrent cron runs',async()=>{const deliver=jest.fn(async()=>({successCount:1,failureCount:0,invalidTokens:[],responses:[]}));const now=new Date('2026-09-30T09:00:00Z');const results=await Promise.all([runNativeMealEngagementNotifications(db,now,deliver),runNativeMealEngagementNotifications(db,now,deliver)]);expect(results.reduce((n,row)=>n+row.sent,0)).toBe(1);expect(deliver).toHaveBeenCalledTimes(1);expect((await runNativeMealEngagementNotifications(db,new Date('2026-09-30T13:30:00Z'),deliver)).due).toBe(0);});
 it('keeps provider failures redacted and honors held/disabled reminders',async()=>{const deliver=jest.fn(async()=>({successCount:0,failureCount:1,invalidTokens:[],responses:[{token:'synthetic-private-token',success:false,error:'messaging/mismatched-credential'}]}));const result=await runNativeMealEngagementNotifications(db,new Date('2026-09-30T09:00:00Z'),deliver);expect(result.failed).toBe(1);const row=(await db.collection('mealengagementdispatches').where('mealPlanId','==',plan.id).get()).docs[0];expect(row.get('status')).toBe('failed');expect(JSON.stringify(row.data())).not.toContain('synthetic-private-token');await user.update({'holdStatus.isOnHold':true});expect((await runNativeMealEngagementNotifications(db,new Date('2026-09-30T09:00:00Z'),deliver)).due).toBe(0);await user.update({'holdStatus.isOnHold':false,'settings.mealReminders':false});expect((await runNativeMealEngagementNotifications(db,new Date('2026-09-30T09:00:00Z'),deliver)).due).toBe(0);});
 it('reuses compact discovery on quiet minutes and catches newly retimed meals before lookback expires',async()=>{
  let value:MealEngagementCandidates|null=null;
  const cache:MealEngagementCandidateCache={get:async()=>value,set:async next=>{value=next;}};
  const deliver=jest.fn(async()=>({successCount:1,failureCount:0,invalidTokens:[],responses:[]}));
  const first=await runNativeMealEngagementNotifications(db,new Date('2026-09-30T08:00:00Z'),deliver,cache);
  expect(first).toMatchObject({discoveryCached:false,plansLoaded:1,due:0});
  // A changed schedule is absent from the prior discovery, but picked up at its
  // two-minute expiry while still inside the normal four-minute due window.
  await plan.update({meals:[{date:new Date('2026-09-30T00:00:00+05:30'),meals:{DINNER:{time:'06:01 PM',foods:[{name:'Synthetic meal'}]}}}]});
  const warm=await runNativeMealEngagementNotifications(db,new Date('2026-09-30T08:01:00Z'),deliver,cache);
  expect(warm).toMatchObject({discoveryCached:true,plansLoaded:0,due:0});
  const refreshed=await runNativeMealEngagementNotifications(db,new Date('2026-09-30T08:02:00Z'),deliver,cache);
  expect(refreshed).toMatchObject({discoveryCached:false,sent:1});
  expect(deliver).toHaveBeenCalledTimes(1);
 });
 it('rechecks current opt-outs and plan cancellation before sending cached candidates',async()=>{
  let value:MealEngagementCandidates|null=null;
  const cache:MealEngagementCandidateCache={get:async()=>value,set:async next=>{value=next;}};
  const deliver=jest.fn(async()=>({successCount:1,failureCount:0,invalidTokens:[],responses:[]}));
  await runNativeMealEngagementNotifications(db,new Date('2026-09-30T08:59:00Z'),deliver,cache);
  expect((await cache.get())?.planIds).toContain(plan.id);
  await user.update({'settings.mealReminders':false});
  expect(await runNativeMealEngagementNotifications(db,new Date('2026-09-30T09:00:00Z'),deliver,cache)).toMatchObject({discoveryCached:true,due:0});
  await user.update({'settings.mealReminders':true});
  await plan.update({status:'cancelled'});
  expect(await runNativeMealEngagementNotifications(db,new Date('2026-09-30T09:00:00Z'),deliver,cache)).toMatchObject({discoveryCached:true,due:0});
  expect(deliver).not.toHaveBeenCalled();
 });
 it('keeps the legacy dispatch duplicate safeguard',async()=>{
  const id=`${plan.id}:2026-09-30:${plan.id}-0-0:photo_prompt`;
  await db.collection('mealengagementdispatches').doc(randomBytes(12).toString('hex')).set({_id:id,mealPlanId:plan.id});
  const deliver=jest.fn(async()=>({successCount:1,failureCount:0,invalidTokens:[],responses:[]}));
  expect(await runNativeMealEngagementNotifications(db,new Date('2026-09-30T09:00:00Z'),deliver)).toMatchObject({duplicates:1,sent:0});
  expect(deliver).not.toHaveBeenCalled();
 });
 it('never caches discovery beyond the configured reminder lookback',()=>{
  expect(candidateCacheDuration(1)).toBe(0);
  expect(candidateCacheDuration(2)).toBe(0);
  expect(candidateCacheDuration(3)).toBe(60_000);
  expect(candidateCacheDuration(4)).toBe(120_000);
  expect(candidateCacheDuration(15)).toBe(120_000);
  const value={generatedAt:0,expiresAt:120_000,planIds:[],plans:0};
  expect(reusableCandidates(value,new Date(60_000),120_000)).toBe(true);
  expect(reusableCandidates(value,new Date(120_000),120_000)).toBe(false);
  expect(reusableCandidates(value,new Date(60_000),60_000)).toBe(false);
  expect(reusableCandidates(value,new Date(-1),120_000)).toBe(false);
 });
 it('does not repeat sparse plan days and disables the live provider wrapper locally',async()=>{const raw=(await plan.get()).data()!;raw.startDate=new Date('2026-09-29T00:00:00+05:30');raw.endDate=new Date('2026-10-01T23:59:59+05:30');raw.meals[0].date=raw.meals[0].date.toDate();expect(getPlanMealSchedules(raw,'2026-09-30')).toHaveLength(1);expect(getPlanMealSchedules(raw,'2026-10-01')).toHaveLength(0);expect(await runMealEngagementNotifications()).toMatchObject({skipped:'local_delivery_disabled'});});
});
