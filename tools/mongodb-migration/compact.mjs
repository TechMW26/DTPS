import {targetCredentials} from './target.mjs';
// Removes transient import audit metadata only, after complete checksummed import/readback verification.
import fs from 'node:fs';
import path from 'node:path';
import {MongoClient} from 'mongodb';
import {arg,manifestAt,checkArchive,save} from './archive.mjs';
targetCredentials();
const dir=path.resolve(arg('--archive','')),database=arg('--database',process.env.MONGODB_DATABASE||'dtps');if(!arg('--archive'))throw new Error('Complete local archive is required');
const manifest=manifestAt(dir);await checkArchive(dir,manifest);
const verificationPath=arg('--verification',path.join(dir,`mongo-verification-${database}.json`)),statePath=arg('--state',path.join(dir,`mongo-import-${database}.json`));
const verify=JSON.parse(fs.readFileSync(verificationPath)),state=JSON.parse(fs.readFileSync(statePath)),source=`${manifest.project}/${manifest.database}`;
if(!verify.complete||!state.complete||verify.database!==database||state.database!==database||verify.source!==source||state.source!==source||verify.run!==state.run||verify.readTime!==manifest.readTime||verify.verified!==state.documents||verify.verified+(verify.excludedArchivedLocally||0)!==manifest.documents)throw new Error('Matching complete import and verification records are required');
for(const file of manifest.files)if(state.completedFiles[file.file]!==file.sha256||!verify.archiveFiles.some(f=>f.file===file.file&&f.sha256===file.sha256&&f.records===file.records))throw new Error('Archive/import/readback checksums disagree');
const unset={_sourceHash:'',_storageHash:'',_migrationRun:''};
const report={database,source,run:state.run,verifiedDocuments:verify.verified,verificationPath,statePath,archive:dir,removedFields:Object.keys(unset),preserved:'All data, _types, document/parent/group paths, original source ISO timestamps, BSON timestamps and source identity',complete:false};
if(!process.argv.includes('--execute')){console.log(JSON.stringify({...report,dryRun:true},null,2));process.exit(0);}
if(!process.env.MONGODB_URI)throw new Error('MONGODB_URI required');
const client=new MongoClient(process.env.MONGODB_URI,{maxPoolSize:4});await client.connect();
try{const db=client.db(database);let compacted=0;for(const group of Object.keys(verify.groups)){const result=await db.collection(group).updateMany({_migrationSource:source,_migrationRun:{$in:state.acceptedRuns||[state.run]}},{$unset:unset});compacted+=result.modifiedCount;}
 Object.assign(report,{complete:true,compacted,completedAt:new Date().toISOString()});save(arg('--report',path.join(dir,`mongo-compaction-${database}.json`)),report);console.log(JSON.stringify(report));
}finally{await client.close();}
