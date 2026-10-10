// Read-only final changed-path verification extending the fenced full baseline proof.
import {MongoClient} from 'mongodb';
import {handoffInputs,saveHandoff} from './journal-cli.mjs';
import {batchRecords,readJournalBatch} from './journal-target-guard.mjs';
import {targetQuietCheck,verifyJournalBatch} from './journal-apply-core.mjs';
const {dir,archive,context,credentials,expectedHashes,changed,deleted}=await handoffInputs();
if(process.argv.includes('--execute'))throw new Error('Journal verification is read-only; --execute is not accepted');
if(!credentials.uri||!process.argv.includes('--verify-target')){console.log(JSON.stringify({dryRun:true,readonly:true,changed,deleted,batches:archive.batches.length}));process.exit(0);}
const client=new MongoClient(credentials.uri,{maxPoolSize:4,promoteBuffers:true});await client.connect();const db=client.db(context.database),startedAt=new Date().toISOString();
try{
 const initial=await targetQuietCheck(db,context,archive.batches,expectedHashes);if(initial.receipts!==archive.batches.length)throw new Error('All atomic apply receipts required before final verification');
 let verified=0,tombstones=0;for(const batch of archive.batches){const check=await verifyJournalBatch(db,batchRecords(await readJournalBatch(dir,batch),context,archive.plan.source),context);verified+=check.verified;tombstones+=check.tombstones;}
 const final=await targetQuietCheck(db,context,archive.batches,expectedHashes);if(final.receipts!==archive.batches.length||verified!==changed||tombstones!==deleted)throw new Error('Final journal verification coverage differs');
 saveHandoff(dir,context,'mongo-journal-verification-dtps.json',{complete:true,readonly:true,baselineVerificationSha256:archive.baselineProofSha256,sourceReadTime:archive.plan.readTime,writeGateTime:archive.plan.writeGateTime,startedAt,completedAt:new Date().toISOString(),verifiedChanged:verified,verifiedTombstones:tombstones,verifiedBaselineExtended:Object.values(final.counts).reduce((a,b)=>a+b,0),receipts:final.receipts,groups:final.counts,retainedOperational:context.allowedExtras.length});
 console.log(JSON.stringify({complete:true,readonly:true,verifiedChanged:verified,verifiedTombstones:tombstones,verifiedBaselineExtended:Object.values(final.counts).reduce((a,b)=>a+b,0)}));
}finally{await client.close();}
