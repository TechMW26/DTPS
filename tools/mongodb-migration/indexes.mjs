import {targetCredentials} from './target.mjs';
// Compact query indexes, not all Firestore projection/covering indexes.
import {MongoClient} from 'mongodb';
import {typeKey} from '../../src/lib/db/mongo-codec.mjs';
import {arg,save} from './archive.mjs';
targetCredentials();
export async function createIndexWithRetry(collection,key,options){
 for(let attempt=0;attempt<4;attempt++){
  try{return await collection.createIndex(key,options);}catch(error){
   if(![91,10107,11600,11602,13435,13436,189,12587].includes(error.code)||attempt===3)throw error;
   console.log(JSON.stringify({indexTransientRetry:true,code:error.code,attempt:attempt+1}));
   await new Promise(resolve=>setTimeout(resolve,Math.min(10000,2000*(attempt+1))));
  }
 }
}
const query=(collection,name,fields,options={})=>{const keys=[['_collectionPath',1]];for(const [field,order=1]of fields){keys.push([field==='_id'?field:`data.${field}`,order]);if(['createdAt','updatedAt','scheduledAt'].includes(field))keys.push([`_types.${typeKey(field.split('.'))}.nanos`,order]);}if(fields.some(([field])=>['createdAt','updatedAt','scheduledAt'].includes(field))&&!fields.some(([field])=>field==='_id'))keys.push(['_id',fields.findLast(([field])=>['createdAt','updatedAt','scheduledAt'].includes(field))[1]||1]);return {collection,name,key:Object.fromEntries(keys),...options};};
const partial=field=>({partialFilterExpression:{[`data.${field}`]:{$type:'string'}}});
export const INDEXES=[
 ...['assignedDietitian','assignedDietitians','assignedHealthCounselor','assignedHealthCounselors','createdBy.userId'].map(field=>query('users',`scope_${field.replaceAll('.','_')}`,[['role'],[field]])),
 query('users','role_created',[['role'],['createdAt',-1]]),...['email','phone'].map(field=>query('users',`lookup_${field}`,[[field]],partial(field))),
 query('messages','pair_recent',[['sender'],['receiver'],['createdAt',-1],['_id',-1]]),query('messages','receiver_unread',[['receiver'],['isRead'],['createdAt',-1]]),query('messages','sender_recent',[['sender'],['createdAt',-1]]),query('messages','receiver_recent',[['receiver'],['createdAt',-1],['_id',-1]]),
 query('_nativeConversations','participants_recent',[['userIds'],['updatedAt',-1]]),
 query('notifications','user_recent',[['userId'],['createdAt',-1]]),query('notifications','user_unread',[['userId'],['read'],['createdAt',-1]]),query('notifications','user_dedupe',[['userId'],['data.dedupeKey']],partial('data.dedupeKey')),
 query('clientmealplans','client_status_end',[['clientId'],['status'],['endDate']]),query('clientmealplans','purchase',[['purchaseId']]),query('clientmealplans','dietitian_operation',[['dietitianId'],['operationId']]),query('clientmealplans','reminder_dates',[['status'],['endDate'],['startDate']]),
 query('unifiedpayments','client_recent',[['client'],['createdAt',-1]]),query('unifiedpayments','client_status',[['client'],['status']]),query('unifiedpayments','client_payment_status',[['client'],['paymentStatus']]),
 ...['razorpayPaymentId','razorpayOrderId','razorpayPaymentLinkId'].map(field=>query('unifiedpayments',`provider_${field}`,[[field]],partial(field))),
 ...['client','dietitian','healthCounselor'].map(field=>query('appointments',`${field}_schedule`,[[field],['scheduledAt']])),
 query('_nativeOutbox','dispatch_due',[['status'],['type'],['createdAt']]),
 query('_nativeRealtimeEvents','target_recent',[['targets'],['createdAt']]),
 // Operational realtime events already expire under the source TTL policy; no business history TTL.
 {collection:'_nativeRealtimeEvents',name:'operational_event_expiry',key:{'data.expiresAt':1},expireAfterSeconds:0},
 query('_nativeMediaReferences','source_url',[['urlHash']]),query('_nativeMessageMedia','url_participants',[['urlHash'],['participants']]),query('_nativeMessageMedia','file_participants',[['fileId'],['participants']]),query('files','owner_recent',[['uploadedBy'],['createdAt',-1]]),
];
export async function main(){
 const approved=INDEXES.filter(spec=>spec.expireAfterSeconds===undefined||process.argv.includes('--enable-operational-ttl')),only=arg('--only-index');
 const planned=only?approved.filter(spec=>spec.name===only):approved;if(only&&planned.length!==1)throw new Error('Supply one exact approved --only-index name');
 const budget=Number(arg('--max-indexes','40')),database=arg('--database',process.env.MONGODB_DATABASE||'dtps');
 if(!Number.isSafeInteger(budget)||budget<0||approved.length>budget)throw new Error('Index count exceeds explicit budget');
 if(planned.some(i=>i.unique))throw new Error('Do not assume phone/email uniqueness');
 if(!process.argv.includes('--execute')){console.log(JSON.stringify({dryRun:true,database,indexes:planned.length,approvedIndexes:approved.length,budget,operationalTTLDeferred:!process.argv.includes('--enable-operational-ttl'),specifications:planned},null,2));return;}
 if(!process.env.MONGODB_URI)throw new Error('MONGODB_URI required');
 const client=new MongoClient(process.env.MONGODB_URI,{maxPoolSize:4});await client.connect();
 const report={database,budget,indexes:planned.length,approvedIndexes:approved.length,created:[],complete:false};
 try{const db=client.db(database);for(const spec of planned){const {collection,name,key,...options}=spec;const created=await createIndexWithRetry(db.collection(collection),key,{name,...options});report.created.push({collection,name:created});console.log(JSON.stringify({indexProgress:true,completed:report.created.length,expected:planned.length,collection,name:created}));}
  let verified=0;for(const collection of new Set(planned.map(spec=>spec.collection))){const actual=await db.collection(collection).listIndexes().toArray();for(const spec of planned.filter(row=>row.collection===collection)){const found=actual.find(row=>row.name===spec.name);if(!found||JSON.stringify(found.key)!==JSON.stringify(spec.key)||Boolean(found.unique)!==Boolean(spec.unique)||found.expireAfterSeconds!==spec.expireAfterSeconds||JSON.stringify(found.partialFilterExpression)!==JSON.stringify(spec.partialFilterExpression))throw new Error('Installed index differs from the compact approved specification');verified++;}}
  report.verified=verified;report.operationalTTLDeferred=!process.argv.includes('--enable-operational-ttl');report.complete=true;report.completedAt=new Date().toISOString();if(arg('--report'))save(arg('--report'),report);console.log(JSON.stringify(report));}finally{await client.close();}
}
if(process.argv[1]&&import.meta.url===new URL(process.argv[1],'file:').href)await main();
