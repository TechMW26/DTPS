import {type MongoDatabase} from '@/lib/db/mongo-types';
/** Bounded, transactionally rechecked retention for transient documents; never touches source data. */
export async function cleanupNativeTransientDocuments(db:MongoDatabase,now=new Date(),perCollection=100){
 const collections=['_nativeRealtimeEvents','_nativePresence','_nativeTyping','_nativeCalls','realtimesignals','mealengagementdispatches'];
 const deleted:Record<string,number>={};
 for(const collection of collections){const rows=await db.collection(collection).where('expiresAt','<=',now).limit(Math.max(1,Math.min(200,perCollection))).select().get();deleted[collection]=0;
  for(let i=0;i<rows.size;i+=100)deleted[collection]+=await db.runTransaction(async tx=>{const current=await tx.getAll(...rows.docs.slice(i,i+100).map(row=>row.ref),{fieldMask:['expiresAt']});let count=0;for(const row of current)if(row.exists&&typeof row.get('expiresAt')?.toMillis==='function'&&row.get('expiresAt').toMillis()<=now.getTime()){tx.delete(row.ref);count++;}return count;});
 }return deleted;
}
