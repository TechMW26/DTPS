import {randomBytes} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/database';
import {saveNativeCatalog,deleteNativeCatalog} from '@/lib/db/repository/native-plan-catalog';
const suite=process.env.DTPS_MONGODB_LOCAL_TEST?describe:describe.skip;
suite('native plan catalogs',()=>{
 let db:ReturnType<typeof getNativeDatabase>;beforeAll(()=>{db=getNativeDatabase();});afterAll(async()=>{await db.terminate();});
 it('assigns stable tier IDs and preserves price and visibility during partial edits',async()=>{
  const actor=randomBytes(12).toString('hex'),plan=await saveNativeCatalog(db,'serviceplans',actor,{name:'Synthetic',category:'custom',isActive:false,showToClients:false,pricingTiers:[{durationDays:30,durationLabel:'30 days',amount:100}]});
  expect(plan.pricingTiers[0]._id).toMatch(/^[a-f0-9]{24}$/);const updated=await saveNativeCatalog(db,'serviceplans',actor,{name:'Renamed'},plan._id);expect(updated.pricingTiers).toEqual(plan.pricingTiers);expect(updated.isActive).toBe(false);expect(updated.showToClients).toBe(false);
  await expect(saveNativeCatalog(db,'serviceplans',actor,{pricingTiers:[{...plan.pricingTiers[0],amount:-1}]},plan._id)).rejects.toMatchObject({status:400});
  await deleteNativeCatalog(db,'serviceplans',plan._id);
 });
 it('protects subscription ownership metadata from mass assignment',async()=>{
  const actor=randomBytes(12).toString('hex'),plan=await saveNativeCatalog(db,'subscriptionplans',actor,{name:'Synthetic',category:'custom',duration:3,durationType:'months',price:100,currency:'inr',isActive:false});
  const changed=await saveNativeCatalog(db,'subscriptionplans',actor,{createdBy:'attacker',price:150},plan._id);expect(changed.createdBy).toBe(actor);expect(changed.isActive).toBe(false);expect(changed.currency).toBe('INR');await deleteNativeCatalog(db,'subscriptionplans',plan._id);
 });
});
