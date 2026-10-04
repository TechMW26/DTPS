// Copy ImageKit references that were never registered in the files collection.
// Uses only the existing private Vercel Blob store; never rewrites source records.
import fs from 'node:fs';import path from 'node:path';import readline from 'node:readline';import dotenv from 'dotenv';
import {cert,initializeApp,deleteApp} from 'firebase-admin/app';import {getFirestore} from 'firebase-admin/firestore';
import {createPrivateBlobArchive} from '../../src/lib/storage/private-blob.mjs';import {downloadSourceAsset} from './media-source.mjs';
import {sha256} from './native-format.mjs';import {nativeDigest} from './import-format.mjs';import {retryTransient} from './retry.mjs';
if(!process.argv.includes('--execute')||process.env.VERCEL||process.env.NODE_ENV==='production')throw new Error('Explicit local staging copy required');
const root=path.resolve('.migration-backups/firebase/native'),dir=path.join(root,'media');
const inputArg=process.argv.indexOf('--references');
const referenceFile=inputArg>=0?path.resolve(process.argv[inputArg+1]):path.join(dir,'references.jsonl');
if(!referenceFile.startsWith(dir+path.sep))throw new Error('Reference input must be a verified local migration manifest');
const audit=JSON.parse(fs.readFileSync(path.join(dir,'reference-audit.json')));if(!audit.complete)throw new Error('Full reference audit required');
const env={...dotenv.parse(fs.readFileSync('.env')),...dotenv.parse(fs.readFileSync('.env.local')),...dotenv.parse(fs.readFileSync(path.join(root,'blob-config.env')))};
if(env.FIREBASE_PROJECT_ID!=='dtps-2cbac')throw new Error('Unexpected project');
const app=initializeApp({projectId:env.FIREBASE_PROJECT_ID,credential:cert({projectId:env.FIREBASE_PROJECT_ID,clientEmail:env.FIREBASE_CLIENT_EMAIL,privateKey:env.FIREBASE_PRIVATE_KEY.replace(/\\n/g,'\n')})},'reference-copy');
const db=getFirestore(app,'dtps-native-staging');db.settings({preferRest:true});
const archive=createPrivateBlobArchive({storeId:env.MIGRATION_BLOB_STORE_ID,token:env.MIGRATION_BLOB_READ_WRITE_TOKEN});
const manifest=path.join(dir,'reference-copies.jsonl'),done=new Set(),covered=new Map(),migrated=new Map();
const lines=file=>readline.createInterface({input:fs.createReadStream(file),crlfDelay:Infinity});
for await(const line of lines(path.join(dir,'migrated.jsonl'))){if(line){const row=JSON.parse(line);if(row.sourceCollection==='files')migrated.set(row.sourceId,row);}}
for await(const line of lines(path.join(dir,'files.jsonl'))){if(line){const row=JSON.parse(line);if(row.imageKitUrl&&migrated.has(row._id))covered.set(new URL(row.imageKitUrl).href,migrated.get(row._id));}}
// Original-video recoveries have the same verified mapping contract as copies.
for(const completed of [manifest,path.join(dir,'reference-recoveries.jsonl')]) {
 if(fs.existsSync(completed))for await(const line of lines(completed)){if(line)done.add(JSON.parse(line).urlHash);}
}
const lock=path.join(dir,'reference-copy.lock'),lf=fs.openSync(lock,'wx',0o600);fs.writeSync(lf,String(process.pid));fs.closeSync(lf);
const fd=fs.openSync(manifest,'a',0o600);let stopping=false;for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{stopping=true;});
const report={copied:0,reused:0,failed:0,failures:{},complete:false,startedAt:new Date().toISOString()};
const save=()=>fs.writeFileSync(path.join(dir,'reference-copy-report.json'),JSON.stringify(report),{mode:0o600});
const seen=new Set(done);
async function copy(row){
 const url=new URL(row.url).href,key=sha256(url);
 if(seen.has(key))return;seen.add(key);
 try{
  const existing=covered.get(url);let record;
  if(existing)record={sourceUrl:url,...(existing.blob?{blob:existing.blob}:{url:existing.url}),verifiedAt:new Date(),verification:existing.verification,sourceAssetId:existing.assetId};
  else{const {bytes,contentType}=await retryTransient(()=>downloadSourceAsset(url));const blob=await retryTransient(()=>archive.store(bytes,contentType));record={sourceUrl:url,blob,verifiedAt:new Date(),verification:'sha256-readback'};}
  const ref=db.collection('_nativeMediaUrls').doc(key);await retryTransient(()=>ref.set(record));
  const readback=await retryTransient(()=>ref.get());if(nativeDigest(readback.data())!==nativeDigest(record))throw new Error('Mapping verification failed');
  fs.writeSync(fd,JSON.stringify({urlHash:key,...record})+'\n');done.add(key);existing?report.reused++:report.copied++;
 }catch(error){const code=/^SOURCE_[A-Z0-9_]+$/.test(error.message)?error.message:'COPY_OR_VERIFICATION_FAILED';report.failed++;report.failures[code]=(report.failures[code]||0)+1;fs.appendFileSync(path.join(dir,'reference-failures.jsonl'),JSON.stringify({urlHash:key,sourceUrl:url,code})+'\n',{mode:0o600});}
 if((report.copied+report.reused+report.failed)%100===0){fs.fsyncSync(fd);save();console.log(JSON.stringify({copied:report.copied,reused:report.reused,failed:report.failed}));}
}
const pending=new Set();let fatal;
try{
 const concurrency=Math.min(128,Math.max(1,Number(process.env.DTPS_MEDIA_COPY_CONCURRENCY)||24));
 for await(const line of lines(referenceFile)){
  if(stopping)break;const row=JSON.parse(line);if(row.host!=='ik.imagekit.io')continue;
  // A slow source must not idle the remaining workers in a fixed-size batch.
  const promise=copy(row).catch(error=>{fatal ||= error;stopping=true;}).finally(()=>pending.delete(promise));pending.add(promise);
  if(pending.size>=concurrency)await Promise.race(pending);
  while(pending.size && process.memoryUsage().rss>768*1024*1024)await Promise.race(pending);
 }
 await Promise.all(pending);if(fatal)throw fatal;fs.fsyncSync(fd);report.complete=!stopping;report.finishedAt=new Date().toISOString();save();
}finally{await Promise.allSettled(pending);fs.fsyncSync(fd);fs.closeSync(fd);fs.unlinkSync(lock);await db.terminate();await deleteApp(app);}
