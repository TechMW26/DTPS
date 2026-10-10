// Consistent complete snapshot: database-wide collection-group discovery includes orphaned subcollections.
// Resumable per group; source writes/deletes are never performed.
import fs from 'node:fs';
import path from 'node:path';
import {createGzip} from 'node:zlib';
import {once} from 'node:events';
import {pipeline} from 'node:stream/promises';
import {archiveLock} from './archive-lock.mjs';
import {indexedNames} from './indexed-names.mjs';
import {streamNames} from './inventory-stream.mjs';
import {sourceConnection} from './source.mjs';
import {partitionedNames,LEADING} from './partitioned-inventory.mjs';
import nextEnv from '@next/env';
const {loadEnvConfig}=nextEnv;
import {arg,fileHash,save,sha256} from './archive.mjs';
loadEnvConfig(process.cwd(),true,{info(){},error(){}});
const dir=path.resolve(arg('--output',''));if(!arg('--output'))throw new Error('Supply --output directory');
const e=process.env,project=arg('--project',e.FIRESTORE_NATIVE_PROJECT_ID),database=arg('--database',e.FIRESTORE_NATIVE_DATABASE_ID);
const clientEmail=e.FIRESTORE_NATIVE_CLIENT_EMAIL,privateKey=e.FIRESTORE_NATIVE_PRIVATE_KEY?.replace(/\\n/g,'\n');if(!project||!database||!clientEmail||!privateKey)throw new Error('Dedicated Firestore source credentials required');
fs.mkdirSync(dir,{recursive:true,mode:0o700});const manifestFile=path.join(dir,'manifest.json');
let manifest=fs.existsSync(manifestFile)?JSON.parse(fs.readFileSync(manifestFile)):null;
if(manifest&&(manifest.project!==project||manifest.database!==database))throw new Error('Output source mismatch');
if(manifest?.complete){console.log(JSON.stringify({alreadyComplete:true,documents:manifest.documents,readTime:manifest.readTime}));process.exit(0);}
const readTime=manifest?.readTime||arg('--read-time',new Date(Math.floor(Date.now()/60000)*60000).toISOString());
const unlock=archiveLock(dir,'export');
const source=sourceConnection(readTime),{db,Pipelines}=source,rest=body=>source.rest('batchGet',body),snapshot=source.snapshot,stream=source.stream;
try{
 if(!manifest){
  const inventory=await snapshot(db.pipeline().database().aggregate({accumulators:[Pipelines.countAll().as('total')],groups:[Pipelines.field('__name__').collectionId().as('collection')]}));
  const groups=inventory.results.map(row=>row.data()).sort((a,b)=>a.collection.localeCompare(b.collection));
  const total=await snapshot(db.pipeline().database().aggregate(Pipelines.countAll().as('total')));const expected=total.results[0].get('total');
  if(groups.reduce((n,g)=>n+g.total,0)!==expected)throw new Error('Database group inventory mismatch');
  manifest={format:'Firestore REST typed documents, gzip JSONL',project,database,readTime,startedAt:new Date().toISOString(),complete:false,documents:0,expectedDocuments:expected,groups,collections:[],files:[],errors:[],media:'Blob objects remain in existing store; all file, URL, manifest, and external-field metadata exported'};save(manifestFile,manifest);
 }
 const skipGroups=new Set((arg('--skip-groups','')).split(',').filter(Boolean));
 for(const group of manifest.groups){
  if(skipGroups.has(group.collection)){console.log(JSON.stringify({deferredGroup:group.collection,expected:group.total}));continue;}
  const file=`${sha256(group.collection).slice(0,20)}.jsonl.gz`;
  const previous=manifest.files.find(x=>x.group===group.collection);
  if(previous){if(await fileHash(path.join(dir,file))!==previous.sha256)throw new Error('Completed shard checksum mismatch');continue;}
  const inventory=(arg('--indexed-name-groups','').split(',').includes(group.collection))?await indexedNames(source,group.collection,group.total,dir):LEADING[group.collection]?await partitionedNames(source,group.collection,group.total,dir):await streamNames(stream(db.pipeline().collectionGroup(group.collection).select('__name__')),group.collection,group.total);
  const names=inventory.map(id=>`projects/${project}/databases/${database}/documents/${id}`);
  if(names.length!==group.total||new Set(names).size!==names.length)throw new Error('Group identity inventory mismatch');
  const expected=new Set(names),counts=new Map(),filename=path.join(dir,file),output=fs.createWriteStream(filename,{mode:0o600}),gz=createGzip({level:6}),done=pipeline(gz,output);done.catch(()=>{});
  let cursor=0,count=0,writing=Promise.resolve();
  try{
   await Promise.all(Array.from({length:8},async()=>{for(;;){const at=cursor;if(at>=names.length)break;const batchSize=/clientmealplans|recipes|diettemplates|mealplantemplates|chunks/.test(group.collection)?40:300;cursor+=batchSize;
    const batch=await rest({documents:names.slice(at,at+batchSize),readTime});
    writing=writing.then(async()=>{for(const row of batch){const doc=row.found;if(!doc?.createTime||!doc.updateTime||!expected.delete(doc.name))throw new Error('Missing/duplicate export document');
      // JSON cannot encode negative zero; Firestore doubleValue strings retain its exact sign.
      const line=JSON.stringify(doc,(_key,value)=>typeof value==='number'&&Object.is(value,-0)?'-0':value)+'\n';if(!gz.write(line))await once(gz,'drain');count++;
      const collectionPath=doc.name.slice(doc.name.indexOf('/documents/')+11).split('/').slice(0,-1).join('/');counts.set(collectionPath,(counts.get(collectionPath)||0)+1);
    }});await writing;
   }}));await writing;gz.end();await done;
   if(expected.size||count!==group.total)throw new Error('Group export count incomplete');
  }catch(error){gz.destroy(error);await done.catch(()=>{});throw error;}
  manifest.files.push({file,group:group.collection,records:count,bytes:fs.statSync(filename).size,sha256:await fileHash(filename)});
  manifest.collections.push(...[...counts].map(([collectionPath,documents])=>({path:collectionPath,documents})));manifest.documents+=count;save(manifestFile,manifest);
  console.log(JSON.stringify({group:group.collection,documents:count,total:manifest.documents,expected:manifest.expectedDocuments}));
 }
 if(manifest.documents!==manifest.expectedDocuments){save(manifestFile,manifest);console.log(JSON.stringify({complete:false,documents:manifest.documents,expected:manifest.expectedDocuments,deferredGroups:[...skipGroups]}));process.exitCode=2;}else{
 manifest.complete=true;manifest.completedAt=new Date().toISOString();save(manifestFile,manifest);console.log(JSON.stringify({complete:true,documents:manifest.documents,groups:manifest.groups.length}));}
}catch(error){if(manifest){manifest.errors.push({at:new Date().toISOString(),message:error.message});save(manifestFile,manifest);}console.error(JSON.stringify({exportFailed:true,reason:error.reason||error.message}));process.exitCode=1;}finally{try{await db.terminate();}finally{unlock();}}
