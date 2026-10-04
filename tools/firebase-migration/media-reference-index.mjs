// Trusted snapshot reference index for private media authorization. Source data is never changed.
import fs from 'node:fs';import path from 'node:path';import readline from 'node:readline';import dotenv from 'dotenv';
import {initializeApp,cert,deleteApp} from 'firebase-admin/app';import {getFirestore} from 'firebase-admin/firestore';
import {sha256} from './native-format.mjs';import {nativeDigest} from './import-format.mjs';import {commitNativeRest} from './rest-commit.mjs';import {retryTransient} from './retry.mjs';
if(!process.argv.includes('--execute')||process.env.VERCEL||process.env.NODE_ENV==='production')throw new Error('Explicit staging index required');
const root=path.resolve('.migration-backups/firebase/native'),dir=path.join(root,'media');
if(!JSON.parse(fs.readFileSync(path.join(dir,'reference-audit.json'))).complete)throw new Error('Completed reference audit required');
const env={...dotenv.parse(fs.readFileSync('.env')),...dotenv.parse(fs.readFileSync('.env.local'))};if(env.FIRESTORE_NATIVE_PROJECT_ID!=='dtps-2cbac'||env.FIRESTORE_NATIVE_DATABASE_ID!=='dtps-native-staging')throw new Error('Unexpected project');
const app=initializeApp({projectId:env.FIRESTORE_NATIVE_PROJECT_ID,credential:cert({projectId:env.FIRESTORE_NATIVE_PROJECT_ID,clientEmail:env.FIRESTORE_NATIVE_CLIENT_EMAIL,privateKey:env.FIRESTORE_NATIVE_PRIVATE_KEY.replace(/\\n/g,'\n')})},'media-reference-index');
const db=getFirestore(app,'dtps-native-staging');db.settings({preferRest:true});
const lock=path.join(dir,'reference-index.lock'),fd=fs.openSync(lock,'wx',0o600);fs.writeSync(fd,String(process.pid));fs.closeSync(fd);
const legacyOnly=process.argv.includes('--legacy-uploads-only');
const stateFile=path.join(dir,legacyOnly?'reference-index-legacy-uploads-state.json':'reference-index-state.json'),state=!process.argv.includes('--restart')&&fs.existsSync(stateFile)?JSON.parse(fs.readFileSync(stateFile)):{verified:0,complete:false};
let stop=false;for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{stop=true;});
try{
 const grouped=new Map();
 for await(const line of readline.createInterface({input:fs.createReadStream(path.join(dir,'references.jsonl')),crlfDelay:Infinity})){
  const row=JSON.parse(line);if(legacyOnly&&row.host==='ik.imagekit.io')continue;if(row.host!=='ik.imagekit.io'&&!/^https:\/\/(?:www\.)?dtps\.tech\/uploads\//.test(row.url||''))continue;
  const decoded=JSON.parse(row.sourceId),id=decoded?.$oid||decoded;if(typeof id!=='string'||id.includes('/'))continue;
  const urlHash=sha256(new URL(row.url).href),reference={collection:row.collection,id,path:row.field};
  if(!grouped.has(urlHash))grouped.set(urlHash,new Map());grouped.get(urlHash).set(JSON.stringify(reference),reference);
 }
 const records=[];
 for(const [urlHash,refs] of [...grouped.entries()].sort(([a],[b])=>a.localeCompare(b))){const values=[...refs.values()];for(let i=0;i<values.length;i+=50)records.push({id:urlHash+'-'+Math.floor(i/50),data:{urlHash,references:values.slice(i,i+50),source:'verified-snapshot'}});}
 const manifestHash=sha256(JSON.stringify(records));if(state.manifestHash&&state.manifestHash!==manifestHash)throw new Error('Reference manifest changed; reconciliation required');state.manifestHash=manifestHash;
 for(let start=state.verified;start<records.length&&!stop;start+=300){
  const batch=records.slice(start,start+300).map(row=>({ref:db.collection('_nativeMediaReferences').doc(row.id),data:row.data}));
  await retryTransient(()=>commitNativeRest(app,batch));
  const rows=await retryTransient(()=>db.getAll(...batch.map(row=>row.ref)));
  for(let i=0;i<rows.length;i++)if(nativeDigest(rows[i].data())!==nativeDigest(batch[i].data))throw new Error('Reference index readback mismatch');
  state.verified=start+batch.length;state.total=records.length;state.updatedAt=new Date().toISOString();fs.writeFileSync(stateFile,JSON.stringify(state),{mode:0o600});
  if(state.verified%3000===0)console.log(JSON.stringify({verified:state.verified,total:state.total}));
 }
 state.complete=state.verified===records.length;fs.writeFileSync(stateFile,JSON.stringify(state),{mode:0o600});
}finally{fs.unlinkSync(lock);await db.terminate();await deleteApp(app);}
