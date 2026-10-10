import fs from 'node:fs';
import path from 'node:path';
import {arg,fileHash,save} from './archive.mjs';
import {targetCredentials} from './target.mjs';
import {journalArchive,quietHandoff,batchRecords,readJournalBatch,rowHash} from './journal-target-guard.mjs';
export async function handoffInputs(){
 const names=['--archive','--activation-proof','--end-vector','--baseline-verification','--target-quiet-proof'];
 if(names.some(n=>!arg(n)))throw new Error('Journal archive, activation/end, baseline verification and target quiet proof required');
 const dir=path.resolve(arg('--archive')),archive=await journalArchive(dir,arg('--activation-proof'),arg('--end-vector'));
 archive.baselineProofSha256=await fileHash(arg('--baseline-verification'));
 const proof=JSON.parse(fs.readFileSync(arg('--baseline-verification'))),quiet=JSON.parse(fs.readFileSync(arg('--target-quiet-proof'))),credentials=targetCredentials();
 const context=quietHandoff(archive,proof,quiet,credentials.database,process.argv.includes('--exclude-migration-archives'));
 // Keep only 64-byte expected checksums in memory, never all medical/media bodies.
 const expectedHashes=new Map();let changed=0,deleted=0;
 for(const batch of archive.batches){const records=batchRecords(await readJournalBatch(dir,batch),context,archive.plan.source);for(const row of records.changed){if(expectedHashes.has(row._id))throw new Error('Duplicate final journal state');expectedHashes.set(row._id,rowHash(row));changed++;}deleted+=records.deleted.length;}
 return {dir,archive,context,credentials,expectedHashes,changed,deleted};
}
export function saveHandoff(dir,context,name,result){save(arg('--report',path.join(dir,name)),{...result,database:context.database,source:context.source,run:context.run,baselineRun:context.baselineRun,archiveHash:context.archiveHash,epoch:context.epoch});}
