const {createHash,randomUUID}=require('node:crypto');
const WATCHED=new Set(['clientmealplans','unifiedpayments']);
// Duplicate and out-of-order deliveries only invalidate; they never apply deltas.
async function invalidateDashboardSummary(db,collection,eventId){
 if(!WATCHED.has(collection)||typeof eventId!=='string'||!eventId)throw new Error('Invalid summary event');
 const receipt=db.collection('_nativeDashboardEvents').doc(createHash('sha256').update(collection+'\0'+eventId).digest('hex'));
 const revision=db.collection('_nativeDashboardRevisions').doc(collection);
 return db.runTransaction(async tx=>{
  if((await tx.get(receipt)).exists)return false;
  tx.set(revision,{revision:randomUUID(),updatedAt:new Date()});
  tx.create(receipt,{expiresAt:new Date(Date.now()+7*86400000)});
  return true;
 });
}
module.exports={invalidateDashboardSummary};
