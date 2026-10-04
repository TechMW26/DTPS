// Rebuild only derived token ownership from current staging users; never send a push.
import fs from 'node:fs';import path from 'node:path';import dotenv from 'dotenv';
import {createHash} from 'node:crypto';
import {cert,initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore,FieldPath} from 'firebase-admin/firestore';
import {retryTransient} from './retry.mjs';
if(!process.argv.includes('--execute')||process.env.VERCEL||process.env.NODE_ENV==='production')throw new Error('Explicit local staging execution required');
const env={...dotenv.parse(fs.readFileSync('.env')),...dotenv.parse(fs.readFileSync('.env.local'))};
if(env.FIRESTORE_NATIVE_PROJECT_ID!=='dtps-2cbac'||env.FIRESTORE_NATIVE_DATABASE_ID!=='dtps-native-staging')throw new Error('Unexpected staging database');
const hash=value=>createHash('sha256').update(value).digest('hex');
const dir=path.resolve('.migration-backups/firebase/native'),stateFile=path.join(dir,'reconciliation/state.json');
const watermark=()=>JSON.parse(fs.readFileSync(stateFile));const sourceWatermark=watermark();
if(!Number.isSafeInteger(sourceWatermark.line))throw new Error('Verified reconciliation watermark required');
const app=initializeApp({projectId:env.FIRESTORE_NATIVE_PROJECT_ID,credential:cert({projectId:env.FIRESTORE_NATIVE_PROJECT_ID,clientEmail:env.FIRESTORE_NATIVE_CLIENT_EMAIL,privateKey:env.FIRESTORE_NATIVE_PRIVATE_KEY.replace(/\\n/g,'\n')})},'native-push-index');
const db=getFirestore(app,env.FIRESTORE_NATIVE_DATABASE_ID);db.settings({preferRest:true});
const lock=path.join(dir,'push-index.lock');fs.writeFileSync(lock,String(process.pid),{flag:'wx',mode:0o600});
try {
 const state=db.collection('_nativeMigrationState').doc('fcmTokens');
 await retryTransient(()=>state.set({complete:false,startedAt:new Date(),sourceWatermark}));
 const groups=new Map();let cursor,usersScanned=0;
 for(;;){let query=db.collection('users').select('fcmTokens').orderBy(FieldPath.documentId()).limit(500);if(cursor)query=query.startAfter(cursor);const rows=await retryTransient(()=>query.get());
  for(const user of rows.docs){usersScanned++;for(const entry of user.get('fcmTokens')||[]){const token=String(typeof entry==='string'?entry:entry?.token||'').trim();if(!token||['null','undefined','nan'].includes(token.toLowerCase()))continue;const key=hash(token),owners=groups.get(key)||new Set();owners.add(user.id);groups.set(key,owners);}}
  if(rows.size<500)break;cursor=rows.docs.at(-1);
 }
 const records=[...groups].map(([key,owners])=>({key,ownerIds:[...owners].sort()}));let verified=0,removed=0;
 for(let i=0;i<records.length;i+=300){const batch=records.slice(i,i+300);await retryTransient(async()=>{const write=db.batch();for(const row of batch)write.set(db.collection('_nativeFcmTokens').doc(row.key),{ownerIds:row.ownerIds,updatedAt:new Date()});await write.commit();});
  const docs=await retryTransient(()=>db.getAll(...batch.map(row=>db.collection('_nativeFcmTokens').doc(row.key))));
  for(let j=0;j<docs.length;j++){if(JSON.stringify(docs[j].get('ownerIds'))!==JSON.stringify(batch[j].ownerIds))throw new Error('Token ownership readback mismatch');verified++;}
 }
 // Stale ownership is removed only after a full source scan and verified writes.
 cursor=undefined;for(;;){let query=db.collection('_nativeFcmTokens').select().orderBy(FieldPath.documentId()).limit(500);if(cursor)query=query.startAfter(cursor);const rows=await retryTransient(()=>query.get()),stale=rows.docs.filter(doc=>!groups.has(doc.id));if(stale.length)await retryTransient(async()=>{const batch=db.batch();for(const doc of stale)batch.delete(doc.ref);await batch.commit();});removed+=stale.length;if(rows.size<500)break;cursor=rows.docs.at(-1);}
 const end=watermark();if(JSON.stringify(end)!==JSON.stringify(sourceWatermark))throw new Error('Reconciliation changed during token indexing');
 const report={complete:true,completedAt:new Date(),sourceWatermark,usersScanned,tokensIndexed:groups.size,verified,removed,duplicateOwnershipGroups:records.filter(row=>row.ownerIds.length>1).length,requiresFinalReconciliation:true};
 await retryTransient(()=>state.set(report));const check=await retryTransient(()=>state.get());if(check.get('verified')!==verified||check.get('sourceWatermark.line')!==sourceWatermark.line||!check.get('complete'))throw new Error('Token index marker readback mismatch');
 const temp=path.join(dir,'push-index.json.tmp'),fd=fs.openSync(temp,'w',0o600);try{fs.writeFileSync(fd,JSON.stringify(report));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(temp,path.join(dir,'push-index.json'));console.log(JSON.stringify(report));
}finally{fs.unlinkSync(lock);await db.terminate();await deleteApp(app);}
