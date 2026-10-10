import {BSON} from 'mongodb';
import {storageHash,sha256} from './archive.mjs';
import {RECEIPTS,rowHash,recordMatches} from './journal-target-guard.mjs';
export const receiptId=(context,batch)=>sha256(context.run)+':'+String(batch.index).padStart(8,'0');
export function validReceipt(receipt,context,batch){if(!receipt||receipt.run!==context.run||receipt.source!==context.source||receipt.archiveHash!==context.archiveHash||receipt.batchIndex!==batch.index||receipt.batchHash!==batch.hash||receipt._id!==receiptId(context,batch)||!receipt.complete)throw new Error('Atomic journal apply receipt differs');for(const field of ['inserted','deleted','updated'])if(!receipt[field]||Object.values(receipt[field]).some(n=>!Number.isSafeInteger(n)||n<0))throw new Error('Invalid receipt operation count');if(!Number.isSafeInteger(receipt.retainedOperational)||receipt.retainedOperational<0)throw new Error('Invalid retained operational count');return receipt;}
function actualGuard(actual,context){if(actual._migrationSource!==context.source||!context.runs.includes(actual._migrationRun)||typeof actual._storageHash!=='string'||storageHash(actual.data,actual._types)!==actual._storageHash)throw new Error('Target path is not an unchanged verified source-owned record');}
export async function applyJournalBatch(client,db,batch,records,context){
 const session=client.startSession();let result;
 try{await session.withTransaction(async()=>{
  const old=await db.collection(context.receiptCollection||RECEIPTS).findOne({_id:receiptId(context,batch)},{session});if(old){result=validReceipt(old,context,batch);return;}
  const grouped=new Map();for(const row of records.changed){const ops=grouped.get(row._collectionGroup)||[];ops.push({kind:'change',row,id:row._id});grouped.set(row._collectionGroup,ops);}for(const item of records.deleted){const group=item.path.split('/').at(-2),ops=grouped.get(group)||[];ops.push({kind:'delete',id:item.path});grouped.set(group,ops);}
  const inserted={},deleted={},updated={};let retainedOperational=0;
  for(const [group,items] of grouped){const coll=db.collection(group),actual=new Map((await coll.find({_id:{$in:items.map(i=>i.id)}},{session}).toArray()).map(r=>[r._id,r])),operations=[];
   for(const item of items){const previous=actual.get(item.id);if(previous&&previous._migrationSource!==context.source){if(item.kind==='delete'&&context.allowedExtras.some(e=>e.collection===group&&e.id===item.id&&e.hash===rowHash(previous))){retainedOperational++;continue;}throw new Error('Refusing target path collision with non-imported data');}
    if(previous)actualGuard(previous,context);
    if(item.kind==='delete'){if(previous){operations.push({deleteOne:{filter:{_id:item.id,_migrationSource:context.source,_migrationRun:previous._migrationRun,_updateTime:previous._updateTime}}});deleted[group]=(deleted[group]||0)+1;}continue;}
    if(previous){operations.push({replaceOne:{filter:{_id:item.id,_migrationSource:context.source,_migrationRun:previous._migrationRun,_updateTime:previous._updateTime},replacement:item.row}});updated[group]=(updated[group]||0)+1;}
    else{operations.push({insertOne:{document:item.row}});inserted[group]=(inserted[group]||0)+1;}
   }
   // Keep each wire command below 4MiB even when a state page contains large media metadata.
   let chunk=[],bytes=0;
   async function flush(){if(!chunk.length)return;const expectedMatch=chunk.filter(o=>o.replaceOne).length,expectedDeletes=chunk.filter(o=>o.deleteOne).length,expectedInserts=chunk.filter(o=>o.insertOne).length,r=await coll.bulkWrite(chunk,{ordered:true,session});if(Number(r.matchedCount)!==expectedMatch||Number(r.deletedCount)!==expectedDeletes||Number(r.insertedCount)!==expectedInserts)throw new Error('Target changed during guarded journal transaction');chunk=[];bytes=0;}
   for(const operation of operations){const size=BSON.calculateObjectSize(operation);if(chunk.length&&bytes+size>4*1024**2)await flush();chunk.push(operation);bytes+=size;}await flush();
  }
  result={_id:receiptId(context,batch),run:context.run,source:context.source,archiveHash:context.archiveHash,batchIndex:batch.index,batchHash:batch.hash,inserted,deleted,updated,retainedOperational,complete:true,completedAt:new Date()};await db.collection(context.receiptCollection||RECEIPTS).insertOne(result,{session});
 },{readConcern:{level:'snapshot'},writeConcern:{w:'majority'},readPreference:'primary'});return result;
 }finally{await session.endSession();}
}
export async function targetQuietCheck(db,context,batches,expectedHashes){
 const batchById=new Map(batches.map(b=>[receiptId(context,b),b])),receipts=await db.collection(context.receiptCollection||RECEIPTS).find({run:context.run}).toArray(),counts={...context.baselineGroups};
 for(const receipt of receipts){const batch=batchById.get(receipt._id);if(!batch)throw new Error('Unreviewed migration receipt exists on target');validReceipt(receipt,context,batch);for(const [g,n] of Object.entries(receipt.inserted||{})){if(!Number.isSafeInteger(n)||n<0)throw new Error('Invalid receipt count');counts[g]=(counts[g]||0)+n;}for(const [g,n] of Object.entries(receipt.deleted||{})){if(!Number.isSafeInteger(n)||n<0)throw new Error('Invalid receipt count');counts[g]=(counts[g]||0)-n;}}
 const controls=new Map((context.controlExtras||[]).map(e=>[e.collection+'\0'+e.id,e]));
 for(const group of ['_nativeMigrationJournalApply','_nativeMigrationJournalBaselineApply'])for await(const row of db.collection(group).find({})){if(group===(context.receiptCollection||RECEIPTS)&&row.run===context.run)continue;const key=group+'\0'+row._id,allowed=controls.get(key);if(!allowed||rowHash(row)!==allowed.hash)throw new Error('Unreviewed prior migration control receipt');controls.delete(key);}if(controls.size)throw new Error('Approved control receipt disappeared');
 const extras=new Map(context.allowedExtras.map(e=>[e.collection+'\0'+e.id,e])),names=new Set((await db.listCollections({}, {nameOnly:true}).toArray()).map(c=>c.name));for(const group of Object.keys(counts))names.add(group);
 for(const group of names){if(['_nativeMigrationJournalApply','_nativeMigrationJournalBaselineApply'].includes(group))continue;const coll=db.collection(group);
  const summary=await coll.aggregate([{$group:{_id:{source:'$_migrationSource',run:'$_migrationRun'},count:{$sum:1},maxUpdate:{$max:'$_updateTime'}}}],{allowDiskUse:false}).toArray();
  let imported=0,owned=0,nonImported=0;
  for(const row of summary){if(row._id.source!==context.source){nonImported+=Number(row.count);continue;}if(!context.runs.includes(row._id.run))throw new Error('Stale/untracked target source run detected');imported+=Number(row.count);if(row._id.run===context.run)owned+=Number(row.count);else if(row.maxUpdate>new Date(context.baselineReadTime))throw new Error('Target preview/untracked source-record write detected');}
  if(imported!==(counts[group]||0))throw new Error('Target source identity counts changed outside journal receipts');
  const approved=[...extras.values()].filter(e=>e.collection===group);if(nonImported!==approved.length)throw new Error('Unexpected or missing non-imported target record');
  if(approved.length)for(const row of await coll.find({_id:{$in:approved.map(e=>e.id)}}).toArray()){const key=group+'\0'+row._id,e=extras.get(key);if(!e||rowHash(row)!==e.hash)throw new Error('Unexpected or modified non-imported target record');extras.delete(key);}
  const ids=[...expectedHashes.keys()].filter(id=>id.split('/').at(-2)===group);let checkedOwned=0;
  for(let offset=0;offset<ids.length;offset+=250)for(const row of await coll.find({_id:{$in:ids.slice(offset,offset+250)},_migrationSource:context.source,_migrationRun:context.run}).toArray()){if(rowHash(row)!==expectedHashes.get(row._id))throw new Error('Resumed journal row changed or lacks checked source state');checkedOwned++;}
  if(checkedOwned!==owned)throw new Error('Untracked journal-owned row lacks checked final source state');
 }
 if(extras.size)throw new Error('Retained operational target records disappeared');return {receipts:receipts.length,counts};
}
export async function verifyJournalBatch(db,records,context){
 let verified=0,tombstones=0;const byGroup=new Map();for(const row of records.changed){const list=byGroup.get(row._collectionGroup)||[];list.push(row);byGroup.set(row._collectionGroup,list);}
 for(const [group,rows] of byGroup){const actual=new Map((await db.collection(group).find({_id:{$in:rows.map(r=>r._id)}}).toArray()).map(r=>[r._id,r]));for(const expected of rows){if(!recordMatches(actual.get(expected._id),expected,[context.run]))throw new Error('Journal target typed body/system-version checksum mismatch');verified++;}}
 for(const {path} of records.deleted){const group=path.split('/').at(-2);if(await db.collection(group).findOne({_id:path,_migrationSource:context.source}))throw new Error('Confirmed source tombstone remains imported on target');tombstones++;}return {verified,tombstones};
}
