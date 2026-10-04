import {randomBytes} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {dashboardSummaryKey,persistentDashboardSummary,SUMMARY_MAX_AGE_MS} from '@/lib/db/repository/persistent-dashboard-summary';
const {invalidateDashboardSummary}=require('../../functions/dashboard-summaries/invalidate.cjs');
const suite=process.env.FIRESTORE_EMULATOR_HOST?describe:describe.skip;
suite('persistent dashboard aggregate cache',()=>{
 let db:ReturnType<typeof getNativeDatabase>;let now:number;const collection='unifiedpayments' as const;
 const key=()=>dashboardSummaryKey([randomBytes(12).toString('hex')]);
 beforeAll(()=>{db=getNativeDatabase();});
 beforeEach(async()=>{now=Date.now();await db.collection('_nativeDashboardRevisions').doc(collection).delete();});
 afterAll(async()=>{for(const name of ['_nativeDashboardSummaries','_nativeDashboardRevisions','_nativeDashboardEvents']){const rows=await db.collection(name).get();for(const row of rows.docs)await row.ref.delete();}await db.terminate();});
 const invalidate=(id=randomBytes(12).toString('hex'))=>invalidateDashboardSummary(db,collection,id);
 test('no initialized trigger state means live reads only',async()=>{
  const load=jest.fn(async()=>({total:1})),cacheKey=key();
  await persistentDashboardSummary(db,collection,cacheKey,load,()=>now);
  await persistentDashboardSummary(db,collection,cacheKey,load,()=>now);
  expect(load).toHaveBeenCalledTimes(2);expect((await db.collection('_nativeDashboardSummaries').doc(cacheKey).get()).exists).toBe(false);
 });
 test('persists across callers and expires after the bounded freshness interval',async()=>{
  await invalidate();const cacheKey=key(),load=jest.fn(async()=>({total:12}));
  expect(await persistentDashboardSummary(db,collection,cacheKey,load,()=>now)).toEqual({total:12});
  expect(await persistentDashboardSummary(db,collection,cacheKey,load,()=>now+1)).toEqual({total:12});
  expect(load).toHaveBeenCalledTimes(1);
  await persistentDashboardSummary(db,collection,cacheKey,load,()=>now+SUMMARY_MAX_AGE_MS);
  expect(load).toHaveBeenCalledTimes(2);
 });
 test('duplicate events are idempotent, later and out-of-order events invalidate without applying deltas',async()=>{
  const event=randomBytes(12).toString('hex');expect(await invalidate(event)).toBe(true);
  const cacheKey=key(),load=jest.fn(async()=>({total:12}));await persistentDashboardSummary(db,collection,cacheKey,load,()=>now);
  expect(await invalidate(event)).toBe(false);await persistentDashboardSummary(db,collection,cacheKey,load,()=>now);expect(load).toHaveBeenCalledTimes(1);
  await invalidate('older-'+event);await persistentDashboardSummary(db,collection,cacheKey,load,()=>now);expect(load).toHaveBeenCalledTimes(2);
 });
 test('a mutation during computation prevents storing its result',async()=>{
  await invalidate();const cacheKey=key();await persistentDashboardSummary(db,collection,cacheKey,async()=>{await invalidate();return {total:4};},()=>now);
  expect((await db.collection('_nativeDashboardSummaries').doc(cacheKey).get()).exists).toBe(false);
 });
 test('different access scopes have different keys; malformed cached data is recomputed',async()=>{
  expect(dashboardSummaryKey([collection,['one']])).not.toBe(dashboardSummaryKey([collection,['two']]));
  await invalidate();const cacheKey=key(),load=jest.fn(async()=>({total:5}));
  await persistentDashboardSummary(db,collection,cacheKey,load,()=>now);
  await db.collection('_nativeDashboardSummaries').doc(cacheKey).update({payload:'invalid JSON'});
  expect(await persistentDashboardSummary(db,collection,cacheKey,load,()=>now)).toEqual({total:5});expect(load).toHaveBeenCalledTimes(2);
 });
 test('failed calculations propagate and cannot replace valid data',async()=>{
  await invalidate();await expect(persistentDashboardSummary(db,collection,key(),async()=>{throw new Error('read failed');},()=>now)).rejects.toThrow('read failed');
 });
 test('concurrent duplicate deliveries write one receipt',async()=>{
  const event=randomBytes(12).toString('hex');const results=await Promise.all([invalidate(event),invalidate(event)]);expect(results.sort()).toEqual([false,true]);
 });
});
