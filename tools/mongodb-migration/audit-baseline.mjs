// Read-only current target deviation audit. Current mismatched BSON is backed up privately, never overwritten.
import fs from 'node:fs';
import path from 'node:path';
import {createGzip} from 'node:zlib';
import {once} from 'node:events';
import {MongoClient,BSON} from 'mongodb';
import {arg,manifestAt,checkArchive,archiveDocuments,mongoRecord,excludedMigrationArchive,save,fileHash} from './archive.mjs';
import {targetCredentials} from './target.mjs';
import {recordMatches,rowHash} from './journal-target-guard.mjs';
if(process.argv.includes('--execute'))throw new Error('Baseline deviation audit is read-only');
const {uri,database}=targetCredentials(),dir=arg('--archive'),output=arg('--output');if(!uri||!dir||!output||database!=='dtps')throw new Error('Dedicated target credentials, complete source archive and separate private --output required');
if(path.resolve(dir)===path.resolve(output)||fs.existsSync(output))throw new Error('Fresh separate private audit output required');
const manifest=manifestAt(dir);await checkArchive(dir,manifest);const source=`${manifest.project}/${manifest.database}`,exclude=process.argv.includes('--exclude-migration-archives'),run=`${source}@${manifest.readTime}${exclude?':without-archives':''}`,startedAt=new Date().toISOString();
fs.mkdirSync(output,{recursive:true,mode:0o700});const differencesFile=path.join(output,'differences.jsonl.gz'),gzip=createGzip(),out=fs.createWriteStream(differencesFile,{mode:0o600});gzip.pipe(out);
async function record(value){if(!gzip.write(JSON.stringify(value)+'\n'))await once(gzip,'drain');}
const client=new MongoClient(uri,{maxPoolSize:4,promoteBuffers:true});await client.connect();const db=client.db(database),groups={},targetGroups={},allowedNonImported=[],controlReceipts=[];let checked=0,excluded=0,differences=0,unexpected=0;
try{
 for(const file of manifest.files){const pending=new Map(),sizes=new Map();let buffered=0,bufferedBytes=0;
  async function flush(group){const rows=pending.get(group);if(!rows?.length)return;pending.set(group,[]);buffered-=rows.length;bufferedBytes-=sizes.get(group)||0;sizes.set(group,0);const actual=new Map((await db.collection(group).find({_id:{$in:rows.map(r=>r._id)}}).toArray()).map(r=>[r._id,r]));for(const expected of rows){checked++;groups[group]=(groups[group]||0)+1;const found=actual.get(expected._id);if(!recordMatches(found,expected,[run])){differences++;await record({kind:found?'changed':'missing',collection:group,path:expected._id,expectedHash:rowHash(expected),actualHash:found?rowHash(found):null,sourceArchiveHash:expected._sourceHash,actualBsonBase64:found?BSON.serialize(found).toString('base64'):null});}if(checked%100000===0)console.log(JSON.stringify({baselineAuditProgress:true,checked,differences}));}}
  for await(const doc of archiveDocuments(path.join(dir,file.file))){if(exclude&&excludedMigrationArchive(doc,manifest)){excluded++;continue;}const row=mongoRecord(doc,manifest,run),rows=pending.get(row._collectionGroup)||[];rows.push(row);pending.set(row._collectionGroup,rows);buffered++;const bytes=BSON.calculateObjectSize(row);bufferedBytes+=bytes;sizes.set(row._collectionGroup,(sizes.get(row._collectionGroup)||0)+bytes);if(rows.length>=250||sizes.get(row._collectionGroup)>=4*1024**2)await flush(row._collectionGroup);if(buffered>=1000||bufferedBytes>=16*1024**2)for(const group of pending.keys())await flush(group);}for(const group of pending.keys())await flush(group);
 }
 const names=new Set((await db.listCollections({},{nameOnly:true}).toArray()).map(r=>r.name));for(const name of Object.keys(groups))names.add(name);
 for(const group of names){const coll=db.collection(group);targetGroups[group]=await coll.countDocuments({_migrationSource:source,_migrationRun:run});const stale=await coll.countDocuments({_migrationSource:source,_migrationRun:{$ne:run}});if(targetGroups[group]!== (groups[group]||0)||stale){unexpected++;await record({kind:'identity-count',collection:group,expected:groups[group]||0,actual:targetGroups[group],stale});}
  for await(const row of coll.find({_migrationSource:{$ne:source}})){const e={collection:group,id:row._id,hash:rowHash(row)};if(['_nativeFcmTokens','_nativePresence'].includes(group)&&typeof row._id==='string'&&row._id.startsWith(group+'/'))allowedNonImported.push(e);else if(['_nativeMigrationJournalApply','_nativeMigrationJournalBaselineApply'].includes(group))controlReceipts.push(e);else unexpected++;await record({kind:'non-imported',...e,actualBsonBase64:BSON.serialize(row).toString('base64')});}
 }
 if(checked+excluded!==manifest.documents)throw new Error('Audit full source coverage differs');gzip.end();await once(out,'finish');
 save(path.join(output,'audit.json'),{complete:true,readonly:true,zeroDeviation:differences===0&&unexpected===0,source,database,run,readTime:manifest.readTime,startedAt,completedAt:new Date().toISOString(),checked,excluded,differences,unexpected,groups,targetGroups,allowedNonImported,allowedControlReceipts:controlReceipts,differencesFile:{file:'differences.jsonl.gz',sha256:await fileHash(differencesFile)},archiveFiles:manifest.files.map(f=>({file:f.file,records:f.records,sha256:f.sha256})),notVerificationProof:true});
 console.log(JSON.stringify({complete:true,readonly:true,checked,differences,unexpected,operationalExtras:allowedNonImported.length,zeroDeviation:differences===0&&unexpected===0}));
}finally{gzip.destroy();out.destroy();await client.close();}
