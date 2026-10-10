// SOURCE remains live. Only an explicitly quiet, verified offline TARGET may change.
import fs from 'node:fs';
import path from 'node:path';
import {MongoClient} from 'mongodb';
import {arg,fileHash,save} from './archive.mjs';
import {targetCredentials} from './target.mjs';
import {baselineSyncArchive,baselineSyncBatches} from './baseline-sync-guard.mjs';
import {quietHandoff,batchRecords,rowHash} from './journal-target-guard.mjs';
import {targetQuietCheck,applyJournalBatch,verifyJournalBatch} from './journal-apply-core.mjs';
const required=['--archive','--activation-proof','--baseline-verification','--target-quiet-proof'];if(required.some(n=>!arg(n)))throw new Error('Complete coherent archive, W0 activation, prior target verification and current quiet proof required');
const dir=path.resolve(arg('--archive')),archive=await baselineSyncArchive(dir,arg('--activation-proof'));
archive.baselineProofSha256=await fileHash(arg('--baseline-verification'));
const proof=JSON.parse(fs.readFileSync(arg('--baseline-verification'))),quiet=JSON.parse(fs.readFileSync(arg('--target-quiet-proof'))),credentials=targetCredentials(),context=quietHandoff(archive,proof,quiet,credentials.database,process.argv.includes('--exclude-migration-archives'),true),batches=[],hashes=new Map();let changed=0,deleted=0;
for await(const {descriptor,typed} of baselineSyncBatches(dir,archive)){batches.push(descriptor);const records=batchRecords(typed,context,archive.manifest.identity.source);for(const row of records.changed){hashes.set(row._id,rowHash(row));changed++;}deleted+=records.deleted.length;}
if(!process.argv.includes('--execute')){console.log(JSON.stringify({dryRun:true,sourceRemainsLive:true,finalCutover:false,readTime:archive.fullManifest.readTime,changed,deleted,batches:batches.length}));process.exit(0);}
if(!process.argv.includes('--target-writers-gated')||!process.argv.includes('--parent-approved-handoff')||!credentials.uri)throw new Error('Offline baseline sync requires --target-writers-gated --parent-approved-handoff and approved dedicated credentials');
const client=new MongoClient(credentials.uri,{maxPoolSize:4,promoteBuffers:true});await client.connect();const db=client.db(context.database),startedAt=new Date().toISOString();
try{
 await targetQuietCheck(db,context,batches,hashes);let verified=0,tombstones=0,applied=0;
 for await(const {descriptor,typed} of baselineSyncBatches(dir,archive)){const records=batchRecords(typed,context,archive.manifest.identity.source);await applyJournalBatch(client,db,descriptor,records,context);const check=await verifyJournalBatch(db,records,context);verified+=check.verified;tombstones+=check.tombstones;if(++applied%100===0)console.log(JSON.stringify({baselineSyncProgress:true,batches:applied,verified,tombstones}));}
 const final=await targetQuietCheck(db,context,batches,hashes);if(final.receipts!==batches.length||verified!==changed||tombstones!==deleted)throw new Error('Offline baseline sync receipt coverage differs');
 save(arg('--report',path.join(dir,'mongo-baseline-sync-dtps.json')),{complete:true,sourceRemainsLive:true,finalCutover:false,source:context.source,database:context.database,run:context.run,baselineRun:context.baselineRun,acceptedRuns:context.runs,sourceReadTime:archive.fullManifest.readTime,archiveHash:archive.sha256,epoch:context.epoch,startedAt,completedAt:new Date().toISOString(),changed:verified,tombstones,groups:final.counts,controlReceipts:(await db.collection(context.receiptCollection).find({run:context.run}).toArray()).map(r=>({collection:context.receiptCollection,id:r._id,hash:rowHash(r)})),fullVerificationRequired:true});
 console.log(JSON.stringify({complete:true,sourceRemainsLive:true,finalCutover:false,changed:verified,tombstones,fullVerificationRequired:true}));
}finally{await client.close();}
