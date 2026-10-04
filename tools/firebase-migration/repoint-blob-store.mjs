import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import {cert,initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore,FieldPath} from 'firebase-admin/firestore';
import {list} from '@vercel/blob';
const root=path.resolve('.migration-backups/firebase/native');
if(!process.argv.includes('--execute') || process.env.VERCEL)throw new Error('Explicit local reference migration required');
const state=JSON.parse(fs.readFileSync(path.join(root,'blob-relocation.json')));
if(!state.complete || state.source!=='store_nVuKTNSRSPpMIkoV' || state.target!=='store_S1BRON8GWQ2akpN0')throw new Error('Verified relocation required');
const env={...dotenv.parse(fs.readFileSync('.env')),...dotenv.parse(fs.readFileSync('.env.local'))};
const oldConfig=dotenv.parse(fs.readFileSync(path.join(root,'blob-config.env')));
let cursor,count=0;
do {const page=await list({token:oldConfig.MIGRATION_BLOB_READ_WRITE_TOKEN,limit:1000,...(cursor?{cursor}:{})});for(const item of page.blobs){const copied=state.objects[item.pathname];if(!copied?.contentTypePreserved || copied.size!==item.size)throw new Error('Source changed after transfer');count++;}cursor=page.hasMore?page.cursor:undefined;}while(cursor);
if(count!==Object.keys(state.objects).length)throw new Error('Source inventory differs');
const oldHost=state.source.slice(6).toLowerCase()+'.private.blob.vercel-storage.com';
function replace(value) {
 if(value===state.source)return state.target;
 if(typeof value==='string' && value.startsWith('https://')) {
  try {const url=new URL(value);if(url.hostname===oldHost){const mapped=state.objects[url.pathname.slice(1)];if(!mapped)throw new Error('Unknown private object reference');return mapped.url;}}catch(error){if(error.message==='Unknown private object reference')throw error;}
  return value;
 }
 if(Array.isArray(value))return value.map(replace);
 if(value && typeof value==='object' && (Object.getPrototypeOf(value)===Object.prototype || Object.getPrototypeOf(value)===null)) {
  if(value.provider==='vercel-blob' && value.storeId===state.source) {
   const mapped=state.objects[value.pathname];if(!mapped || mapped.sha256!==value.sha256 || mapped.size!==value.size)throw new Error('Unverified object reference');
   const {contentTypePreserved,...ref}=mapped;return ref;
  }
  return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,replace(v)]));
 }
 return value;
}
const snapshots=JSON.parse(fs.readFileSync(path.join(root,'snapshots/manifest.json')));
const app=initializeApp({projectId:env.FIREBASE_PROJECT_ID,credential:cert({projectId:env.FIREBASE_PROJECT_ID,clientEmail:env.FIREBASE_CLIENT_EMAIL,privateKey:env.FIREBASE_PRIVATE_KEY.replace(/\\n/g,'\n')})},'blob-repoint');
if(env.FIREBASE_PROJECT_ID!=='dtps-2cbac')throw new Error('Wrong staging project');
const db=getFirestore(app,'dtps-native-staging');let updated=0,checked=0;
try {
 for(const collection of [...Object.keys(snapshots.collections),'_mediaAssets','_migration_quarantine']) {
  let after;
  for(;;) {
   let query=db.collection(collection).orderBy(FieldPath.documentId()).limit(200);if(after)query=query.startAfter(after);
   const page=await query.get();if(page.empty)break;
   const changed=[];const batch=db.batch();
   for(const doc of page.docs){checked++;const original=doc.data(),mapped=replace(original);if(JSON.stringify(original)!==JSON.stringify(mapped)){batch.set(doc.ref,mapped);changed.push(doc.ref);}}
   if(changed.length){await batch.commit();for(const doc of await db.getAll(...changed)){if(JSON.stringify(doc.data())!==JSON.stringify(replace(doc.data())))throw new Error('Staging reference update failed');}updated+=changed.length;}
   after=page.docs.at(-1);
  }
 }
 const files=['snapshots/manifest.json','media/migrated.jsonl','blob-canary.json'];
 for(const name of files){const file=path.join(root,name);if(!fs.existsSync(file))continue;const raw=fs.readFileSync(file,'utf8');const text=name.endsWith('.jsonl')?raw.split('\n').filter(Boolean).map(line=>JSON.stringify(replace(JSON.parse(line)))).join('\n')+'\n':JSON.stringify(replace(JSON.parse(raw)));fs.writeFileSync(file+'.tmp',text,{mode:0o600});fs.renameSync(file+'.tmp',file);}
 fs.copyFileSync(path.join(root,'blob-config.env'),path.join(root,'retired-blob-config.env'));fs.chmodSync(path.join(root,'retired-blob-config.env'),0o600);
 fs.copyFileSync(path.join(root,'existing-blob-config.env'),path.join(root,'blob-config.env'));fs.chmodSync(path.join(root,'blob-config.env'),0o600);
 const report={source:state.source,target:state.target,verifiedObjects:count,checkedDocuments:checked,updatedDocuments:updated,referencesUpdated:true,verifiedAt:new Date().toISOString()};
 fs.writeFileSync(path.join(root,'blob-repoint-report.json'),JSON.stringify(report),{mode:0o600});console.log(JSON.stringify(report));
}finally{await db.terminate();await deleteApp(app);}
