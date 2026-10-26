// Adds missing search indexes. It NEVER changes, moves or deletes any record.
// Without --apply it only shows what it would do (dry run).
import {MongoClient} from 'mongodb';
import fs from 'node:fs';
const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').split(/\r?\n/).filter(l=>/^[A-Z0-9_]+\s*=/.test(l)).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,'')];}));
const uri=env.MONGODB_URI,dbName=env.MONGODB_DATABASE||'dtps',apply=process.argv.includes('--apply');
if(!uri)throw new Error('MONGODB_URI not found in .env.local');
const plan=[
 ['users',{'data.role':1,'data.status':1},'perf_users_role_status'],
 ['unifiedpayments',{'data.dietitian':1},'perf_unifiedpayments_dietitian'],
 ['paymentlinks',{'data.razorpayPaymentLinkId':1},'perf_paymentlinks_rzpLinkId'],
 ['paymentlinks',{'data.client':1},'perf_paymentlinks_client'],
 ['journaltrackings',{'data.client':1,'data.date':1},'perf_journaltrackings_client_date'],
 ['progressentries',{'data.user':1,'data.type':1,'data.recordedAt':-1},'perf_progressentries_user_type_recordedAt'],
 ['lifestyleinfos',{'data.userId':1},'perf_lifestyleinfos_userId'],
 // Batch 2
 ['mealengagementdispatches',{'data._id':1},'perf_mealdispatches_legacyId'],
 ['clientmealplans',{'data.status':1,'data.startDate':1},'perf_clientmealplans_status_startDate'],
 ['recipes',{'data.uuid':1},'perf_recipes_uuid'],
 ['recipes',{'data.name':1},'perf_recipes_name'],
 ['_nativeRealtimeEvents',{'data.targets':1,'data.createdAt':1},'perf_realtimeevents_targets_createdAt'],
 ['_nativeRealtimeEvents',{'data.expiresAt':1},'perf_realtimeevents_expiresAt'],
 ['_nativePresence',{'data.expiresAt':1},'perf_presence_expiresAt'],
 ['_nativeTyping',{'data.expiresAt':1},'perf_typing_expiresAt'],
 ['_nativeCalls',{'data.expiresAt':1},'perf_calls_expiresAt'],
 ['mealengagementdispatches',{'data.expiresAt':1},'perf_mealdispatches_expiresAt'],
 ['_nativeConversations',{'data.userIds':1},'perf_conversations_userIds'],
 ['_nativeMediaReferences',{'data.urlHash':1},'perf_mediarefs_urlHash'],
];
const client=new MongoClient(uri);
try{
 await client.connect();const db=client.db(dbName);
 console.log(apply?'MODE: APPLY (creating indexes)\n':'MODE: DRY RUN (nothing will be created)\n');
 const existing=new Set((await db.listCollections({},{nameOnly:true}).toArray()).map(c=>c.name));
 for(const [name,key,indexName] of plan){
  if(!existing.has(name)){console.log(`SKIP     ${name} (collection not found)`);continue;}
  const col=db.collection(name),indexes=await col.listIndexes().toArray(),wantKeys=Object.keys(key);
  const exists=indexes.some(i=>{const k=Object.keys(i.key).filter(f=>f!=='_collectionPath'&&f!=='_collectionGroup');return wantKeys.every((f,n)=>k[n]===f);});
  if(exists){console.log(`SKIP     ${name} ${wantKeys.join(' + ')} (already exists)`);continue;}
  if(!apply){console.log(`WILL ADD ${name} ${wantKeys.join(' + ')}   (${await col.estimatedDocumentCount()} docs)`);continue;}
  const started=Date.now();await col.createIndex(key,{name:indexName});
  console.log(`ADDED    ${name} ${wantKeys.join(' + ')} in ${((Date.now()-started)/1000).toFixed(1)}s`);
 }
 console.log('\nFinished. No records were changed.');
}finally{await client.close();}