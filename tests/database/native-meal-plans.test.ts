import type * as MongoTypes from '@/lib/db/mongo-types';
import { getNativeDatabase } from '@/lib/db/database';
import { deleteNativeMealPlan } from '@/lib/db/repository/native-meal-plans';
import { randomUUID } from 'node:crypto';

const suite = process.env.DTPS_MONGODB_LOCAL_TEST ? describe : describe.skip;
suite('native MongoDB plan allocation transactions (local Mongo replica only)', () => {
  const prefix = 'test-' + randomUUID();
  let db: ReturnType<typeof getNativeDatabase>;
  const refs: MongoTypes.DocumentReference[] = [];
  beforeAll(async () => { db = getNativeDatabase(); for(const [id,role] of [['admin','admin'],['staff','dietitian'],['counselor','health_counselor'],['outsider','dietitian']]){const ref=db.collection('users').doc(id);refs.push(ref);await ref.set({role,status:'active'});}const client=db.collection('users').doc('client');refs.push(client);await client.set({role:'client',assignedDietitian:'staff'}); });
  afterAll(async () => { for (const ref of refs) await ref.delete(); await db.terminate(); });
  async function put(collection: string, suffix: string, data: MongoTypes.DocumentData) {
    const ref = db.collection(collection).doc(prefix + suffix); refs.push(ref); await ref.set(data); return ref;
  }
  it('restores used days exactly once under concurrent repeated deletion', async () => {
    const purchase = await put('unifiedpayments', 'purchase', {client:'client',durationDays:90,daysUsed:20,remainingDays:70,linkedMealPlanIds:[prefix+'a',prefix+'b'],mealPlan:prefix+'a'});
    const shared = {clientId:'client',purchaseId:purchase.id,status:'active',duration:10};
    const a = await put('clientmealplans', 'a', shared);
    await put('clientmealplans', 'b', shared);
    const actor = {id:'admin',role:'admin' as const};
    const result = await Promise.all([deleteNativeMealPlan(db,a.id,actor),deleteNativeMealPlan(db,a.id,actor)]);
    expect(result.reduce((n,r)=>n+r.restoredDays,0)).toBe(10);
    expect((await purchase.get()).data()).toMatchObject({daysUsed:10,remainingDays:80,linkedMealPlanIds:[prefix+'b']});
  });
  it('allows staff draft deletion but blocks staff deletion of published plans', async () => {
    const draft = await put('clientmealplans','draft',{status:'draft',dietitianId:'staff',clientId:'client'});
    const published = await put('clientmealplans','published',{status:'draft',firstPublishedAt:new Date()});
    const actor = {id:'staff',role:'dietitian' as const};
    expect((await deleteNativeMealPlan(db,draft.id,actor)).restoredDays).toBe(0);
    await expect(deleteNativeMealPlan(db,published.id,actor)).rejects.toThrow('Only admins');
    expect((await published.get()).get('isDeleted')).toBeUndefined();
  });
  it('rolls back deletion when the linked program is missing', async () => {
    const plan = await put('clientmealplans','orphan',{status:'active',purchaseId:prefix+'missing',clientId:'client'});
    await expect(deleteNativeMealPlan(db,plan.id,{id:'admin',role:'admin'})).rejects.toThrow('Linked program');
    expect((await plan.get()).get('isDeleted')).toBeUndefined();
  });
  it('prevents unrelated staff from deleting drafts and permits assigned counselors', async () => {
    const client = await put('users','assigned-client',{assignedHealthCounselors:['counselor']});
    const draft = await put('clientmealplans','assigned-draft',{status:'draft',clientId:client.id});
    await expect(deleteNativeMealPlan(db,draft.id,{id:'outsider',role:'dietitian'})).rejects.toThrow('Forbidden');
    expect((await draft.get()).get('isDeleted')).toBeUndefined();
    expect((await deleteNativeMealPlan(db,draft.id,{id:'counselor',role:'health_counselor'})).deletedPlan).not.toBeNull();
  });
});
