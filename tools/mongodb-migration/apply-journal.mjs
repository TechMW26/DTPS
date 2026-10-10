// Atomic changed-path application. No target connection or mutation without all handoff flags.
import {MongoClient} from 'mongodb';
import {handoffInputs,saveHandoff} from './journal-cli.mjs';
import {batchRecords,readJournalBatch} from './journal-target-guard.mjs';
import {targetQuietCheck,applyJournalBatch,verifyJournalBatch} from './journal-apply-core.mjs';
const input=await handoffInputs(),{dir,archive,context,credentials,expectedHashes,changed,deleted}=input;
if(!process.argv.includes('--execute')){console.log(JSON.stringify({dryRun:true,database:context.database,events:archive.manifest.events,changed,deleted,batches:archive.batches.length,targetQuietProofRequired:true}));process.exit(0);}
if(!process.argv.includes('--writers-gated')||!process.argv.includes('--parent-approved-handoff')||!credentials.uri)throw new Error('Execution requires --writers-gated --parent-approved-handoff and dedicated approved target credentials');
const client=new MongoClient(credentials.uri,{maxPoolSize:4,promoteBuffers:true});await client.connect();const db=client.db(context.database),startedAt=new Date().toISOString();
try{
 await targetQuietCheck(db,context,archive.batches,expectedHashes);
 let applied=0,verified=0,tombstones=0;
 for(const batch of archive.batches){const records=batchRecords(await readJournalBatch(dir,batch),context,archive.plan.source);await applyJournalBatch(client,db,batch,records,context);const check=await verifyJournalBatch(db,records,context);applied++;verified+=check.verified;tombstones+=check.tombstones;if(applied%100===0)console.log(JSON.stringify({journalApplyProgress:true,batches:applied,verified,tombstones}));}
 const final=await targetQuietCheck(db,context,archive.batches,expectedHashes);
 if(final.receipts!==archive.batches.length||verified!==changed||tombstones!==deleted)throw new Error('Journal apply coverage differs');
 saveHandoff(dir,context,'mongo-journal-apply-dtps.json',{complete:true,startedAt,completedAt:new Date().toISOString(),receipts:final.receipts,changed:verified,tombstones,groups:final.counts,retainedOperational:context.allowedExtras.length});
 console.log(JSON.stringify({complete:true,changed:verified,tombstones,receipts:final.receipts,separateVerificationRequired:true}));
}finally{await client.close();}
