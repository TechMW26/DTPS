import {targetCredentials} from './target.mjs';
import path from 'node:path';
import {MongoClient,BSON} from 'mongodb';
import {requestPool} from './batch.mjs';
import {baselineProof,checkDeltaFiles} from './delta-guard.mjs';
import {archiveDocuments,arg,checkArchive,manifestAt,mongoRecord,storageHash,save,excludedMigrationArchive} from './archive.mjs';
targetCredentials();
const dir=path.resolve(arg('--archive','')),database=arg('--database',process.env.MONGODB_DATABASE||'dtps');if(!arg('--archive')||!process.env.MONGODB_URI)throw new Error('Archive and MONGODB_URI required');
const manifest=manifestAt(dir);await checkArchive(dir,manifest);const excludeArchives=process.argv.includes('--exclude-migration-archives'),source=`${manifest.project}/${manifest.database}`,run=`${source}@${manifest.readTime}${excludeArchives?':without-archives':''}`;
const acceptedRuns=[run];if(arg('--baseline-verification')){await checkDeltaFiles(dir,manifest);acceptedRuns.push(baselineProof(manifest,arg('--baseline-verification'),database,excludeArchives).run);}
const client=new MongoClient(process.env.MONGODB_URI,{maxPoolSize:8,promoteBuffers:true});await client.connect();const db=client.db(database),pool=requestPool(8);
const counts=new Map();let verified=0,excluded=0;const report={source,database,run,readTime:manifest.readTime,acceptedRuns,excludeMigrationArchives:excludeArchives,archiveFiles:manifest.files.map(f=>({file:f.file,sha256:f.sha256,records:f.records})),complete:false,verified:0,startedAt:new Date().toISOString()};
try{
 for(const file of manifest.files){const pending=new Map(),sizes=new Map();
  async function flush(group){const rows=pending.get(group);if(!rows?.length)return;pending.set(group,[]);sizes.set(group,0);await pool.add(async()=>{const found=await db.collection(group).find({_id:{$in:rows.map(x=>x._id)}}).toArray();const byId=new Map(found.map(x=>[x._id,x]));
   for(const expected of rows){const actual=byId.get(expected._id);if(!actual||actual._migrationSource!==source||!acceptedRuns.includes(actual._migrationRun)||actual._sourceHash!==expected._sourceHash||actual._sourceUpdateTime!==expected._sourceUpdateTime||actual._sourceCreateTime!==expected._sourceCreateTime||actual._createTime?.getTime()!==expected._createTime.getTime()||actual._updateTime?.getTime()!==expected._updateTime.getTime()||actual._collectionPath!==expected._collectionPath||actual._parentPath!==expected._parentPath||actual._collectionGroup!==expected._collectionGroup||actual._createTimestamp?.seconds!==expected._createTimestamp.seconds||actual._createTimestamp?.nanos!==expected._createTimestamp.nanos||actual._updateTimestamp?.seconds!==expected._updateTimestamp.seconds||actual._updateTimestamp?.nanos!==expected._updateTimestamp.nanos||actual._storageHash!==expected._storageHash||storageHash(actual.data,actual._types)!==expected._storageHash)throw new Error(`Target checksum mismatch in ${group}`);verified++;counts.set(group,(counts.get(group)||0)+1);if(verified%100000===0)console.log(JSON.stringify({verificationProgress:true,verified,expected:manifest.documents,excluded}));}});
  }
  for await(const doc of archiveDocuments(path.join(dir,file.file))){if(excludeArchives&&excludedMigrationArchive(doc,manifest)){excluded++;continue;}const row=mongoRecord(doc,manifest,run),list=pending.get(row._collectionGroup)||[];list.push(row);pending.set(row._collectionGroup,list);sizes.set(row._collectionGroup,(sizes.get(row._collectionGroup)||0)+BSON.calculateObjectSize(row));if(list.length>=250||sizes.get(row._collectionGroup)>=4*1024*1024)await flush(row._collectionGroup);if([...pending.values()].reduce((n,a)=>n+a.length,0)>=1000)for(const group of pending.keys())await flush(group);}
  for(const group of pending.keys())await flush(group);await pool.drain();console.log(JSON.stringify({verified,expected:manifest.documents}));
 }
 if(verified+excluded!==manifest.documents)throw new Error('Verified total differs from source');
 for(const [group,count] of counts){if(await db.collection(group).countDocuments({_migrationSource:source,_migrationRun:{$in:acceptedRuns}})!==count)throw new Error('Target group count mismatch');}
 for(const {name} of await db.listCollections({}, {nameOnly:true}).toArray())if(await db.collection(name).countDocuments({_migrationSource:source,_migrationRun:{$nin:acceptedRuns}}))throw new Error('Target contains stale source rows: final prune required');
 Object.assign(report,{complete:true,verified,excludedArchivedLocally:excluded,groups:Object.fromEntries(counts),completedAt:new Date().toISOString()});save(arg('--report',path.join(dir,`mongo-verification-${database}.json`)),report);console.log(JSON.stringify({complete:true,verified,excludedArchivedLocally:excluded,groups:counts.size}));
}finally{await pool.drain().catch(()=>{});await client.close();}
