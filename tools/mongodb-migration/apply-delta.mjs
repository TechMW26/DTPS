import {targetCredentials} from './target.mjs';
// Apply only verified final changes; deterministic IDs and source guard make retries idempotent.
import fs from 'node:fs';
import path from 'node:path';
import {MongoClient,BSON} from 'mongodb';
import {archiveDocuments,arg,manifestAt,checkArchive,mongoRecord,save,excludedMigrationArchive,excludedArchivePath} from './archive.mjs';
import {baselineProof,checkDeltaFiles} from './delta-guard.mjs';
import {requestPool} from './batch.mjs';
targetCredentials();
const dir=path.resolve(arg('--archive','')),database=arg('--database',process.env.MONGODB_DATABASE||'dtps');if(!arg('--archive')||!arg('--baseline-verification'))throw new Error('Final archive and --baseline-verification required');
const manifest=manifestAt(dir);await checkArchive(dir,manifest);await checkDeltaFiles(dir,manifest);const excludeArchives=process.argv.includes('--exclude-migration-archives'),proof=baselineProof(manifest,arg('--baseline-verification'),database,excludeArchives),source=proof.source,run=`${source}@${manifest.readTime}${excludeArchives?':without-archives':''}`;
if(!process.argv.includes('--execute')){console.log(JSON.stringify({dryRun:true,database,source,readTime:manifest.readTime,baselineRun:proof.run,changed:manifest.changedDocuments,deleted:manifest.deletedDocuments,writersMustBeGated:true}));process.exit(0);}
if(!manifest.finalCutover||!manifest.writeGateTime||Date.parse(manifest.readTime)<Date.parse(manifest.writeGateTime))throw new Error('Final delta was not captured after a completed write gate');
if(!process.argv.includes('--writers-gated')||!process.env.MONGODB_URI)throw new Error('Explicit --writers-gated and MONGODB_URI required');
const stateFile=arg('--state',path.join(dir,`mongo-import-${database}.json`));let state=fs.existsSync(stateFile)?JSON.parse(fs.readFileSync(stateFile)):null;
if(state&&(state.run!==run||state.database!==database||state.source!==source||state.baselineRun!==proof.run))throw new Error('Delta state snapshot differs');state||={complete:false,source,database,run,baselineRun:proof.run,acceptedRuns:[proof.run,run],startedAt:new Date().toISOString(),completedFiles:{}};
const client=new MongoClient(process.env.MONGODB_URI,{maxPoolSize:8,promoteBuffers:true});await client.connect();const db=client.db(database),pool=requestPool(8);
try{
 if(!state.changedApplied){const batches=new Map(),sizes=new Map();let changed=0,excluded=0;
  async function flush(group){const ops=batches.get(group);if(!ops?.length)return;batches.set(group,[]);sizes.set(group,0);await pool.add(()=>db.collection(group).bulkWrite(ops,{ordered:false}));}
  for await(const doc of archiveDocuments(path.join(dir,'changed.jsonl.gz'))){if(excludeArchives&&excludedMigrationArchive(doc,manifest)){excluded++;continue;}const row=mongoRecord(doc,manifest,run),group=row._collectionGroup,ops=batches.get(group)||[];ops.push({replaceOne:{filter:{_id:row._id},replacement:row,upsert:true}});batches.set(group,ops);sizes.set(group,(sizes.get(group)||0)+BSON.calculateObjectSize(row));changed++;if(ops.length>=250||sizes.get(group)>=4*1024*1024)await flush(group);if([...batches.values()].reduce((n,a)=>n+a.length,0)>=1000)for(const key of batches.keys())await flush(key);}
  for(const key of batches.keys())await flush(key);await pool.drain();if(changed+excluded!==manifest.changedDocuments)throw new Error('Changed source total differs');Object.assign(state,{changedApplied:true,changed,excludedChanged:excluded});save(stateFile,state);
 }
 if(!state.deletesApplied){const groups=new Map();let seen=0;async function flush(group){const ids=groups.get(group);if(!ids?.length)return;groups.set(group,[]);await pool.add(()=>db.collection(group).deleteMany({_id:{$in:ids},_migrationSource:source,_migrationRun:{$in:state.acceptedRuns}}));}
  for await(const row of archiveDocuments(path.join(dir,'deleted.jsonl.gz'))){const parts=row.path?.split('/');if(!parts||parts.length%2||parts.some(x=>!x))throw new Error('Deleted source identity invalid');seen++;if(excludeArchives&&excludedArchivePath(row.path))continue;const group=parts.at(-2),ids=groups.get(group)||[];ids.push(row.path);groups.set(group,ids);if(ids.length>=500)await flush(group);}
  for(const group of groups.keys())await flush(group);await pool.drain();if(seen!==manifest.deletedDocuments)throw new Error('Deleted source total differs');Object.assign(state,{deletesApplied:true,deletedSourceRecords:seen});save(stateFile,state);
 }
 const excluded=excludeArchives?(manifest.collections||[]).filter(c=>excludedArchivePath(c.path)).reduce((n,c)=>n+c.documents,0):0;
 Object.assign(state,{complete:true,documents:manifest.documents-excluded,excludedDocuments:excluded,completedFiles:Object.fromEntries(manifest.files.map(f=>[f.file,f.sha256])),completedAt:new Date().toISOString()});save(stateFile,state);console.log(JSON.stringify({complete:true,changed:state.changed,deletedSourceRecords:state.deletedSourceRecords,finalDocuments:state.documents,fullVerificationRequired:true}));
}finally{await pool.drain().catch(()=>{});await client.close();}
