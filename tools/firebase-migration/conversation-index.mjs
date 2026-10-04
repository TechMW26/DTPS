// Rebuild the derived conversation directory from the current native staging data.
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import dotenv from 'dotenv';
import {initializeApp,cert,deleteApp} from 'firebase-admin/app';import {getFirestore,FieldPath,Timestamp} from 'firebase-admin/firestore';
import {retryTransient} from './retry.mjs';
if(!process.argv.includes('--execute')||process.env.VERCEL||process.env.NODE_ENV==='production')throw new Error('Explicit staging index required');
const env={...dotenv.parse(fs.readFileSync('.env')),...dotenv.parse(fs.readFileSync('.env.local'))};if(env.FIRESTORE_NATIVE_PROJECT_ID!=='dtps-2cbac'||env.FIRESTORE_NATIVE_DATABASE_ID!=='dtps-native-staging')throw new Error('Unexpected project');
const app=initializeApp({projectId:env.FIRESTORE_NATIVE_PROJECT_ID,credential:cert({projectId:env.FIRESTORE_NATIVE_PROJECT_ID,clientEmail:env.FIRESTORE_NATIVE_CLIENT_EMAIL,privateKey:env.FIRESTORE_NATIVE_PRIVATE_KEY.replace(/\\n/g,'\n')})},'conversation-index');const db=getFirestore(app,'dtps-native-staging');db.settings({preferRest:true});
const marker=db.collection('_nativeMigrationState').doc('conversations');
const checkpointFile=path.resolve('.migration-backups/firebase/native/conversation-index-checkpoint.json');
const reconciliationFile=path.resolve('.migration-backups/firebase/native/reconciliation/state.json');
const sourceWatermark=()=>fs.existsSync(reconciliationFile)?JSON.parse(fs.readFileSync(reconciliationFile,'utf8')):{line:0};
const durableSave=(file,value)=>{const temporary=file+'.tmp',fd=fs.openSync(temporary,'w',0o600);try{fs.writeFileSync(fd,JSON.stringify(value));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(temporary,file);const directory=fs.openSync(path.dirname(file),'r');try{fs.fsyncSync(directory);}finally{fs.closeSync(directory);}};
const prior=!process.argv.includes('--restart')&&fs.existsSync(checkpointFile)?JSON.parse(fs.readFileSync(checkpointFile,'utf8')):null;
if(prior&&(prior.version!==1||prior.project!==env.FIRESTORE_NATIVE_PROJECT_ID||prior.database!=='dtps-native-staging'))throw new Error('Invalid conversation checkpoint identity');
if(prior&&JSON.stringify(prior.sourceWatermark)!==JSON.stringify(sourceWatermark()))throw new Error('Native source reconciliation changed; restart the derived index with --restart');
let scanned=prior?.scanned||0,verified=0,invalid=prior?.invalid||0,removed=0,cursor=prior?.cursor,scanComplete=prior?.scanComplete||false;
const grouped=new Map((prior?.grouped||[]).map(([key,data])=>[key,{...data,updatedAt:new Timestamp(data.updatedAt.seconds,data.updatedAt.nanoseconds)}])),startedAt=prior?new Date(prior.startedAt):new Date(),sourceAtStart=prior?.sourceWatermark||sourceWatermark();
const checkpoint=()=>durableSave(checkpointFile,{version:1,project:env.FIRESTORE_NATIVE_PROJECT_ID,database:'dtps-native-staging',startedAt,scanned,invalid,cursor,scanComplete,sourceWatermark:sourceAtStart,grouped:[...grouped].map(([key,data])=>[key,{...data,updatedAt:{seconds:data.updatedAt.seconds,nanoseconds:data.updatedAt.nanoseconds}}])});
try{
 await retryTransient(()=>marker.set({complete:false,startedAt,sourceWatermark:sourceAtStart}));
 while(!scanComplete){let query=db.collection('messages').orderBy(FieldPath.documentId()).select('sender','receiver','createdAt','deletedAt').limit(1000);if(cursor)query=query.startAfter(cursor);const rows=await retryTransient(()=>query.get());
  for(const doc of rows.docs){const row=doc.data();scanned++;if(row.deletedAt)continue;if(!/^[a-f0-9]{24}$/.test(String(row.sender))||!/^[a-f0-9]{24}$/.test(String(row.receiver))||typeof row.createdAt?.toMillis!=='function'){invalid++;continue;}const userIds=[String(row.sender),String(row.receiver)].sort();const key=createHash('sha256').update(userIds.join('\0')).digest('hex');const prior=grouped.get(key);if(!prior||row.createdAt.toMillis()>prior.updatedAt.toMillis()||row.createdAt.toMillis()===prior.updatedAt.toMillis()&&doc.id>prior.lastMessageId)grouped.set(key,{userIds,lastMessageId:doc.id,updatedAt:row.createdAt});}
  if(rows.size)cursor=rows.docs.at(-1).id;scanComplete=rows.size<1000;checkpoint();if(scanned%50000===0)console.log(JSON.stringify({scanned,conversations:grouped.size}));
 }
 const entries=[...grouped];
 for(let i=0;i<entries.length;i+=100){
  const batch=entries.slice(i,i+100);
  const expected=await retryTransient(()=>db.runTransaction(async tx=>{
   const docs=await tx.getAll(...batch.map(([id])=>db.collection('_nativeConversations').doc(id)));const outputs=[];
   for(let n=0;n<batch.length;n++){
    const [,data]=batch[n],current=docs[n],time=current.get('updatedAt')?.toMillis?.()||0;
    if(!current.exists||time<data.updatedAt.toMillis()||time===data.updatedAt.toMillis()&&String(current.get('lastMessageId'))<=data.lastMessageId){tx.set(current.ref,data);outputs.push({ref:current.ref,data});}
    else outputs.push({ref:current.ref,data:current.data()});
   }return outputs;
  }));
  const readback=await retryTransient(()=>db.getAll(...expected.map(item=>item.ref)));
  for(let n=0;n<readback.length;n++){
   const current=readback[n],wanted=expected[n].data;
   if(!current.exists||JSON.stringify(current.get('userIds'))!==JSON.stringify(wanted.userIds)||
     current.get('updatedAt').toMillis()<wanted.updatedAt.toMillis()||
     current.get('updatedAt').toMillis()===wanted.updatedAt.toMillis()&&current.get('lastMessageId')!==wanted.lastMessageId)throw new Error('Conversation index readback mismatch');
   verified++;
  }
 }
 // Remove obsolete pairs only when no write after the scan began could have created them.
 const existing=await retryTransient(()=>db.collection('_nativeConversations').get());
 for(const row of existing.docs){if(grouped.has(row.id))continue;
  const deleted=await retryTransient(()=>db.runTransaction(async tx=>{
   const current=await tx.get(row.ref);if(!current.exists||current.get('updatedAt')?.toMillis?.()>startedAt.getTime())return false;
   tx.delete(row.ref);return true;
  }));if(deleted){if((await retryTransient(()=>row.ref.get())).exists)throw new Error('Stale conversation index deletion readback failed');removed++;}
 }
 const sourceAtEnd=sourceWatermark();const report={complete:invalid===0&&JSON.stringify(sourceAtStart)===JSON.stringify(sourceAtEnd),scanned,verified,invalid,removed,completedAt:new Date(),sourceWatermark:sourceAtStart,sourceWatermarkAtCompletion:sourceAtEnd,requiresFinalReconciliation:true};await retryTransient(()=>marker.set(report));const confirmation=await retryTransient(()=>marker.get());if(confirmation.get('scanned')!==scanned||confirmation.get('verified')!==verified||confirmation.get('complete')!==report.complete)throw new Error('Index completion marker readback failed');durableSave(path.resolve('.migration-backups/firebase/native/conversation-index.json'),report);console.log(JSON.stringify(report));
}finally{await db.terminate();await deleteApp(app);}
