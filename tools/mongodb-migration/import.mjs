import {targetCredentials} from './target.mjs';
import path from 'node:path';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {MongoClient,BSON} from 'mongodb';
import {requestPool} from './batch.mjs';
import {archiveDocuments,arg,checkArchive,manifestAt,mongoRecord,save,excludedMigrationArchive,sha256,canonical} from './archive.mjs';
targetCredentials();
const dir=path.resolve(arg('--archive','')),database=arg('--database',process.env.MONGODB_DATABASE||'dtps');
if(!arg('--archive')||!database||/[/\\. "*$<>:|?]/.test(database))throw new Error('Supply --archive and a valid --database');
const excludeArchives=process.argv.includes('--exclude-migration-archives'),manifest=manifestAt(dir);await checkArchive(dir,manifest);
const excludedEstimate=excludeArchives?(manifest.collections||[]).filter(c=>['_migration_originals','_migration_checks'].includes(c.path.split('/')[0])).reduce((n,c)=>n+c.documents,0):0;
if(!process.argv.includes('--execute')){console.log(JSON.stringify({dryRun:true,source:`${manifest.project}/${manifest.database}`,documents:manifest.documents,readTime:manifest.readTime,targetDatabase:database,files:manifest.files.length,excludeMigrationArchives:excludeArchives,excludedArchivedLocally:excludedEstimate,expectedImported:manifest.documents-excludedEstimate}));process.exit(0);}
const uri=process.env.MONGODB_URI;if(!uri)throw new Error('MONGODB_URI is required');
const stateFile=arg('--state',path.join(dir,`mongo-import-${database}.json`));
const source=`${manifest.project}/${manifest.database}`,run=`${source}@${manifest.readTime}${excludeArchives?':without-archives':''}`;
let state=fs.existsSync(stateFile)?JSON.parse(fs.readFileSync(stateFile,'utf8')):null;
if(state&&(state.run!==run||state.database!==database||state.source!==source))throw new Error('Import state belongs to another source/snapshot');
state||={run,database,source,startedAt:new Date().toISOString(),completedFiles:{},documents:0,excludedDocuments:0,archiveExclusions:{},complete:false};
const client=new MongoClient(uri,{maxPoolSize:8,promoteBuffers:true});await client.connect();const db=client.db(database),pool=requestPool(8);
try{
 for(const file of manifest.files){if(state.completedFiles[file.file]===file.sha256)continue;
  const batches=new Map(),sizes=new Map(),excludedHash=createHash('sha256'),excludedCounts={};let count=0,excluded=0;
  async function flush(group){const ops=batches.get(group);if(!ops?.length)return;batches.set(group,[]);sizes.set(group,0);await pool.add(()=>db.collection(group).bulkWrite(ops,{ordered:false}));}
  for await(const doc of archiveDocuments(path.join(dir,file.file))){
   if(excludeArchives&&excludedMigrationArchive(doc,manifest)){excluded++;const p=doc.name.split('/documents/')[1].split('/').slice(0,-1).join('/');excludedCounts[p]=(excludedCounts[p]||0)+1;excludedHash.update(sha256(JSON.stringify(canonical(doc)))+'\n');continue;}
   const row=mongoRecord(doc,manifest,run);const group=row._collectionGroup;
   if(!group||group.includes('\0')||group.includes('$'))throw new Error('Unsupported target collection name');
   const ops=batches.get(group)||[];ops.push({replaceOne:{filter:{_id:row._id},replacement:row,upsert:true}});batches.set(group,ops);sizes.set(group,(sizes.get(group)||0)+BSON.calculateObjectSize(row));count++;if(count%100000===0)console.log(JSON.stringify({importProgress:true,processed:count,completedBeforeFile:state.documents,excluded,expected:manifest.documents}));
   if(ops.length>=250||sizes.get(group)>=4*1024*1024)await flush(group);
   // Bound memory even when a single archive interleaves thousands of collection names.
   if([...batches.values()].reduce((n,list)=>n+list.length,0)>=1000)for(const name of batches.keys())await flush(name);
  }
  for(const name of batches.keys())await flush(name);await pool.drain();
  if(count+excluded!==file.records)throw new Error('Imported archive record count differs');
  state.completedFiles[file.file]=file.sha256;state.documents+=count;state.excludedDocuments+=excluded;state.archiveExclusions[file.file]={documents:excluded,paths:excludedCounts,contentHash:excludedHash.digest('hex'),sourceArchiveHash:file.sha256,sourceArchive:path.join(dir,file.file)};save(stateFile,state);
  console.log(JSON.stringify({file:file.file,imported:count,total:state.documents,excluded:state.excludedDocuments,expected:manifest.documents}));
 }
 if(state.documents+state.excludedDocuments!==manifest.documents)throw new Error('Import is incomplete');
 if(process.argv.includes('--prune')){
  if(!process.argv.includes('--writers-gated'))throw new Error('Final prune requires explicit --writers-gated');
  // Only previously imported source rows are eligible. Run only while source/app writes are gated.
  const groups=new Set((await db.listCollections({}, {nameOnly:true}).toArray()).map(x=>x.name));let removed=0;
  for(const group of groups){const result=await db.collection(group).deleteMany({_migrationSource:source,_migrationRun:{$ne:run}});removed+=result.deletedCount;}
  state.prunedDocuments=removed;
 }
 state.complete=true;state.completedAt=new Date().toISOString();save(stateFile,state);
 console.log(JSON.stringify({importComplete:true,documents:state.documents,excludedArchivedLocally:state.excludedDocuments,pruned:state.prunedDocuments||0,verificationRequired:true}));
}finally{await pool.drain().catch(()=>{});await client.close();}
