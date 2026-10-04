import {getNativeDatabase} from '@/lib/db/firestore-native';

const PUBLISHED_PLAN_STATUSES=['active','completed','paused','cancelled'];
export async function hasPublishedMealPlan(clientId:string):Promise<boolean> {
  const plans=await getNativeDatabase().collection('clientmealplans').where('clientId','==',clientId).where('status','in',PUBLISHED_PLAN_STATUSES).select('isDeleted').get();
  return plans.docs.some(plan=>plan.get('isDeleted')!==true);
}
export async function grantDietPlanAccess(clientId:string):Promise<void> {
  const db=getNativeDatabase(),ref=db.collection('users').doc(clientId);
  await db.runTransaction(async tx=>{const doc=await tx.get(ref);if(doc.get('role')==='client'&&doc.get('onboardingCompleted')!==true)tx.update(ref,{onboardingCompleted:true});});
}
export async function grantDietPlanAccessIfPublished(clientId:string):Promise<boolean> {
  const published=await hasPublishedMealPlan(clientId);if(published)await grantDietPlanAccess(clientId);return published;
}
