const {initializeApp}=require('firebase-admin/app');
const {getFirestore}=require('firebase-admin/firestore');
if(!process.env.FIRESTORE_EMULATOR_HOST||!/^demo-/.test(process.env.GCLOUD_PROJECT||''))throw new Error('Emulator-only test');
initializeApp({projectId:process.env.GCLOUD_PROJECT});
const db=getFirestore();
async function waitForRevision(collection,previous){
 const deadline=Date.now()+20000;
 while(Date.now()<deadline){const revision=(await db.collection('_nativeDashboardRevisions').doc(collection).get()).get('revision');if(revision&&revision!==previous)return revision;await new Promise(r=>setTimeout(r,200));}
 throw new Error(`Trigger did not invalidate ${collection}`);
}
(async()=>{
 for(const collection of ['clientmealplans','unifiedpayments']){
  const source=db.collection(collection).doc('synthetic-trigger-check');
  let revision=(await db.collection('_nativeDashboardRevisions').doc(collection).get()).get('revision');
  await source.set({status:'active',amount:1});revision=await waitForRevision(collection,revision);
  await source.update({status:'cancelled',amount:2});revision=await waitForRevision(collection,revision);
  await source.delete();await waitForRevision(collection,revision);
 }
 console.log('Verified create, update and delete delivery for both summary triggers.');await db.terminate();
})().catch(error=>{console.error(error.message);process.exitCode=1;});
