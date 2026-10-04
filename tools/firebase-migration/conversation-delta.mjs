// Refresh only conversation pairs affected by verified source reconciliation.
// Source journal is read-only; writes are restricted to the native staging derived index.
import fs from 'node:fs';import path from 'node:path';import readline from 'node:readline';import {createHash} from 'node:crypto';import dotenv from 'dotenv';
import {initializeApp,cert,deleteApp} from 'firebase-admin/app';import {getFirestore,FieldPath} from 'firebase-admin/firestore';
import {retryTransient} from './retry.mjs';
if(!process.argv.includes('--execute')||process.env.VERCEL||process.env.NODE_ENV==='production')throw new Error('Explicit staging refresh required');
const root=path.resolve('.migration-backups/firebase'),native=path.join(root,'native');
const readEnv=file=>fs.existsSync(file)?dotenv.parse(fs.readFileSync(file)):{};const env={...readEnv('.env'),...readEnv('.env.local')};if(env.FIRESTORE_NATIVE_PROJECT_ID!=='dtps-2cbac'||env.FIRESTORE_NATIVE_DATABASE_ID!=='dtps-native-staging')throw new Error('Unexpected project');
const stateFile=path.join(native,'reconciliation/state.json'),reportFile=path.join(native,'conversation-index.json'),state=()=>JSON.parse(fs.readFileSync(stateFile)),base=JSON.parse(fs.readFileSync(reportFile)),target=state(),from=base.sourceWatermark?.line,to=target.line;
if(!base.complete||!Number.isSafeInteger(from)||!Number.isSafeInteger(to)||from>to)throw new Error('A completed base index and verified reconciliation watermark are required');
const save=(file,value)=>{const temp=file+'.tmp',fd=fs.openSync(temp,'w',0o600);try{fs.writeFileSync(fd,JSON.stringify(value));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(temp,file);};
const changed=new Set();let line=0;const input=fs.createReadStream(path.join(root,'changes.ejsonl')),reader=readline.createInterface({input,crlfDelay:Infinity});try{for await(const text of reader){line++;if(line>to)break;if(line<=from)continue;const event=JSON.parse(text);if(event.collection==='messages'){const id=typeof event.id==='string'?event.id:event.id?.$oid;if(typeof id!=='string'||!/^[a-f0-9]{24}$/i.test(id))throw new Error('Invalid message journal identity');changed.add(id);}}}finally{reader.close();input.destroy();}if(line<to)throw new Error('Journal shorter than verified reconciliation');
const app=initializeApp({projectId:env.FIRESTORE_NATIVE_PROJECT_ID,credential:cert({projectId:env.FIRESTORE_NATIVE_PROJECT_ID,clientEmail:env.FIRESTORE_NATIVE_CLIENT_EMAIL,privateKey:env.FIRESTORE_NATIVE_PRIVATE_KEY.replace(/\\n/g,'\n')})},'conversation-delta');const db=getFirestore(app,'dtps-native-staging');db.settings({preferRest:true});
const pairs=new Map(),hash=ids=>createHash('sha256').update(ids.join('\0')).digest('hex');let messageReads=0,indexReads=0,invalid=0,fallbackScans=0;
function addPair(ids){if(!Array.isArray(ids)||ids.length!==2||!ids.every(id=>typeof id==='string'&&/^[a-f0-9]{24}$/i.test(id)))throw new Error('Invalid conversation routing');const sorted=[...ids].sort();pairs.set(hash(sorted),sorted);}
try{
 const ids=[...changed];for(let i=0;i<ids.length;i+=100){const docs=await retryTransient(()=>db.getAll(...ids.slice(i,i+100).map(id=>db.collection('messages').doc(id)),{fieldMask:['sender','receiver','deletedAt']}));messageReads+=docs.length;for(const doc of docs)if(doc.exists&&!doc.get('deletedAt'))addPair([doc.get('sender'),doc.get('receiver')]);}
 // A changed/deleted last message can invalidate its old pair even when its current routing changed.
 for(let i=0;i<ids.length;i+=30){const rows=await retryTransient(()=>db.collection('_nativeConversations').where('lastMessageId','in',ids.slice(i,i+30)).select('userIds').get());indexReads+=rows.size;for(const doc of rows.docs)addPair(doc.get('userIds'));}
 const entries=[...pairs],verified=[];let next=0;
 async function refresh([key,userIds]){
  let unordered=false;
  const run=()=>db.runTransaction(async tx=>{
   const ref=db.collection('_nativeConversations').doc(key);await tx.get(ref);let latest=null;
   for(const [sender,receiver] of [userIds,[...userIds].reverse()]){
    let query=db.collection('messages').where('sender','==',sender).where('receiver','==',receiver).select('sender','receiver','createdAt','deletedAt');if(!unordered)query=query.orderBy('createdAt','desc').orderBy(FieldPath.documentId(),'desc');let cursor;
    for(;;){const rows=await tx.get(cursor?query.startAfter(cursor).limit(100):query.limit(100));messageReads+=rows.size;
     for(const doc of rows.docs){if(doc.get('deletedAt'))continue;const date=doc.get('createdAt');if(typeof date?.toMillis!=='function'){invalid++;continue;}if(!latest||date.toMillis()>latest.updatedAt.toMillis()||date.toMillis()===latest.updatedAt.toMillis()&&doc.id>latest.lastMessageId)latest={userIds,lastMessageId:doc.id,updatedAt:date};if(!unordered)break;}
     if(!unordered&&rows.docs.some(doc=>!doc.get('deletedAt')&&typeof doc.get('createdAt')?.toMillis==='function')||rows.size<100)break;cursor=rows.docs.at(-1);
    }
   }
   if(latest)tx.set(ref,latest);else tx.delete(ref);return latest;
  });
  let expected;try{expected=await retryTransient(run);}catch(error){if(error.code!==9||!/index/i.test(error.message))throw error;unordered=true;fallbackScans++;expected=await retryTransient(run);}
  const row=await retryTransient(()=>db.collection('_nativeConversations').doc(key).get());indexReads++;
  if(expected?(!row.exists||JSON.stringify(row.get('userIds'))!==JSON.stringify(expected.userIds)||row.get('lastMessageId')!==expected.lastMessageId||row.get('updatedAt')?.toMillis?.()!==expected.updatedAt.toMillis()):row.exists)throw new Error('Conversation delta readback mismatch');verified.push(key);
 }
 await Promise.all(Array.from({length:Math.min(4,entries.length)},async()=>{while(next<entries.length){const entry=entries[next++];await refresh(entry);}}));
 const end=state();const report={...base,complete:invalid===0&&end.line===to,sourceWatermark:target,sourceWatermarkAtCompletion:end,completedAt:new Date(),requiresFinalReconciliation:true,delta:{from,to,changedMessages:changed.size,affectedPairs:pairs.size,verifiedPairs:verified.length,messageReads,indexReads,invalid,fallbackScans}};
 if(!report.complete)throw new Error('Conversation delta did not reach a stable valid watermark');
 const marker=db.collection('_nativeMigrationState').doc('conversations');await retryTransient(()=>marker.set(report));const check=await retryTransient(()=>marker.get());if(check.get('sourceWatermark.line')!==to||check.get('complete')!==true)throw new Error('Conversation completion marker readback mismatch');save(path.join(native,'conversation-delta-'+to+'.json'),report);save(reportFile,report);console.log(JSON.stringify(report.delta));
}finally{await db.terminate();await deleteApp(app);}
