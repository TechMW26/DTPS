import fs from 'node:fs';
import path from 'node:path';
import {archiveDocuments,manifestAt,checkArchive,fileHash,sha256,canonical} from './archive.mjs';
import {checkDeltaFiles} from './delta-guard.mjs';
import {journalPlan,timeNs,resource} from './journal-guard.mjs';
export async function baselineSyncArchive(dir,activationFile){
 const manifest=manifestAt(dir);await checkArchive(dir,manifest);await checkDeltaFiles(dir,manifest);
 const activation=JSON.parse(fs.readFileSync(activationFile));
 if(manifest.finalCutover||manifest.bootstrapIncomplete||!manifest.baselineReadTime||!manifest.baselineFiles?.length)throw new Error('Offline baseline sync requires complete coherent non-final delta');
 if(timeNs(manifest.readTime)<=timeNs(manifest.baselineReadTime))throw new Error('Offline baseline snapshot must be newer than prior verified source time');
 journalPlan(activation,manifest,{...activation,readTime:manifest.readTime,writersGated:false});
 if(!Number.isSafeInteger(manifest.changedDocuments)||!Number.isSafeInteger(manifest.deletedDocuments))throw new Error('Complete delta counts required');
 return {manifest:{completedAt:manifest.completedAt,identity:{source:{project:manifest.project,database:manifest.database},epoch:activation.epoch,baselineReadTime:manifest.baselineReadTime,baselineFiles:manifest.baselineFiles,readTime:manifest.readTime,final:false,writeGateTime:null}},fullManifest:manifest,sha256:await fileHash(path.join(dir,'manifest.json'))};
}
export async function* baselineSyncBatches(dir,archive){
 const m=archive.fullManifest,source={project:m.project,database:m.database},seen=new Set();let index=0,changed=0,deleted=0;
 for(const kind of ['changed','deleted']){let rows=[];async function descriptor(){const typed={changed:kind==='changed'?rows:[],deleted:kind==='deleted'?rows:[]};return {descriptor:{index:index++,hash:sha256(JSON.stringify(canonical(typed)))},typed};}
  for await(const row of archiveDocuments(path.join(dir,kind+'.jsonl.gz'))){let id;
   if(kind==='changed'){const prefix=resource(source,'');if(!row.name?.startsWith(prefix)||!row.createTime||!row.updateTime||timeNs(row.createTime)>timeNs(row.updateTime)||timeNs(row.updateTime)>timeNs(m.readTime))throw new Error('Baseline changed state identity/system fence differs');id=row.name.slice(prefix.length);changed++;}
   else{id=row.path;deleted++;}
   const parts=typeof id==='string'?id.split('/'):[];if(parts.length<2||parts.length%2||parts.some(s=>!s||s==='.'||s==='..'||s.includes('\0'))||seen.has(id))throw new Error('Duplicate or malformed baseline changed/deleted path');seen.add(id);if(seen.size>1000000)throw new Error('Offline baseline changed-path budget exceeded');rows.push(row);if(rows.length===40){yield await descriptor();rows=[];}
  }if(rows.length)yield await descriptor();
 }
 if(changed!==m.changedDocuments||deleted!==m.deletedDocuments)throw new Error('Baseline delta count differs from complete source snapshot');
}
