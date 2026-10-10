import {restFields,restValue} from './archive.mjs';
export const SHARDS=16;
export const JOURNAL='_nativeMigrationJournal',COUNTERS='_nativeMigrationJournalCounters';
export const eventId=(epoch,shard,seq)=>`${epoch}-${String(shard).padStart(2,'0')}-${String(seq).padStart(16,'0')}`;
export const counterId=(epoch,shard)=>`${epoch}-${String(shard).padStart(2,'0')}`;
export const resource=(source,path)=>`projects/${source.project}/databases/${source.database}/documents/${path}`;
export function timeNs(iso){const stamp=restValue({timestampValue:iso});return BigInt(stamp.seconds)*1000000000n+BigInt(stamp.nanoseconds);}
function vector(value){if(!Array.isArray(value)||value.length!==SHARDS||value.some(n=>!Number.isSafeInteger(n)||n<0))throw new Error('Exactly 16 safe nonnegative sequence values required');return value;}
function identity(proof,source,epoch){if(!proof.complete||proof.project!==source.project||proof.database!==source.database||proof.epoch!==epoch||!Number.isFinite(Date.parse(proof.readTime)))throw new Error('Journal proof identity or fixed time differs');vector(proof.vector);}
export function journalPlan(activation,baseline,end,maxEvents=1000000){
 const source={project:baseline.project,database:baseline.database},epoch=activation.epoch;
 if(!baseline.complete||!baseline.files?.length||!/^[A-Za-z0-9_-]{8,80}$/.test(epoch||''))throw new Error('Complete postactivation baseline and valid journal epoch required');
 identity(activation,source,epoch);identity(end,source,epoch);
 if(activation.coverageConfirmed!==true||!Number.isFinite(Date.parse(activation.activatedAt)))throw new Error('Producer activation and coverage proof required');
 if(timeNs(activation.readTime)<timeNs(activation.activatedAt)||timeNs(baseline.readTime)<timeNs(activation.readTime)||timeNs(end.readTime)<timeNs(baseline.readTime))throw new Error('Preactivation or mixed baseline/sequence times prohibited');
 const missing=activation.missingCounterShards||[];
 if(!Array.isArray(missing)||new Set(missing).size!==missing.length||missing.some(s=>!Number.isInteger(s)||s<0||s>=SHARDS||activation.vector[s]!==0))throw new Error('Missing counters allowed only as explicit activation zeros');
 const idle=end.missingCounterShards||[];
 if(!Array.isArray(idle)||new Set(idle).size!==idle.length||idle.some(s=>!missing.includes(s)||activation.vector[s]!==0||end.vector[s]!==0))throw new Error('End counter hole must be the same explicitly proved idle zero shard');
 if(end.writersGated===true&&(!end.writeGateTime||timeNs(end.readTime)<timeNs(end.writeGateTime)||timeNs(end.writeGateTime)<timeNs(activation.activatedAt)))throw new Error('Sealed vector requires completed writer gate before fixed readTime');
 let events=0;const ranges=activation.vector.map((start,shard)=>{const stop=end.vector[shard];if(stop<start)throw new Error('Sequence vector moved backwards');events+=stop-start;if(!Number.isSafeInteger(events))throw new Error('Sequence range exceeds safe integer bounds');return {shard,start,stop};});
 if(!Number.isSafeInteger(maxEvents)||maxEvents<0||events>maxEvents)throw new Error('Journal event budget exceeded');
 return {source,epoch,ranges,events,readTime:end.readTime,final:Boolean(end.writersGated),writeGateTime:end.writeGateTime||null,activationReadTime:activation.readTime};
}
export function counterVector(rows,proof,allowMissing=false){
 const source={project:proof.project,database:proof.database},expected=new Map(Array.from({length:SHARDS},(_,s)=>[resource(source,`${COUNTERS}/${counterId(proof.epoch,s)}`),s])),seen=new Set(),found=Array(SHARDS),missing=[];
 for(const row of rows){const name=row.found?.name||row.missing,shard=expected.get(name);if(shard===undefined||seen.has(shard))throw new Error('Counter identity missing, duplicated or from another source');seen.add(shard);
  if(row.missing){if(!allowMissing||!(proof.missingCounterShards||[]).includes(shard))throw new Error('Counter hole after activation');found[shard]=0;missing.push(shard);continue;}
  const d=restFields(row.found.fields||{});if(d.epoch!==proof.epoch||d.shard!==shard||d.sourceProject!==source.project||d.sourceDatabase!==source.database||!Number.isSafeInteger(d.seq)||d.seq<0||!row.found.createTime||!row.found.updateTime||timeNs(row.found.createTime)>timeNs(row.found.updateTime)||timeNs(row.found.updateTime)>timeNs(proof.readTime))throw new Error('Counter protocol mismatch');found[shard]=d.seq;
 }
 if(seen.size!==SHARDS||found.some((seq,s)=>seq!==proof.vector[s])||allowMissing&&JSON.stringify(missing.sort((a,b)=>a-b))!==JSON.stringify([...(proof.missingCounterShards||[])].sort((a,b)=>a-b)))throw new Error('Counter vector differs from recorded proof');return found;
}
export function validBusinessPath(path){const parts=typeof path==='string'?path.split('/'):[];return parts.length>=2&&parts.length%2===0&&!parts[0].startsWith('_nativeMigrationJournal')&&!parts.some(s=>!s||s==='.'||s==='..'||s.includes('\0'));}
export function journalEvent(doc,plan,shard,seq){
 if(doc?.name!==resource(plan.source,`${JOURNAL}/${eventId(plan.epoch,shard,seq)}`))throw new Error('Journal sequence identity differs');
 const d=restFields(doc.fields||{});
 if(d.epoch!==plan.epoch||d.shard!==shard||d.seq!==seq||!Number.isSafeInteger(d.seq)||d.seq<1||d.sourceProject!==plan.source.project||d.sourceDatabase!==plan.source.database||!Array.isArray(d.paths)||!d.paths.length||d.paths.some(p=>!validBusinessPath(p))||new Set(d.paths).size!==d.paths.length)throw new Error('Journal event protocol mismatch');
 const stamp=d.committedAt;if(!stamp||!Number.isSafeInteger(stamp.seconds)||!Number.isSafeInteger(stamp.nanoseconds))throw new Error('Journal server commit timestamp required');
 // REQUEST_TIME is millisecond precision. Immutable document createTime is the exact atomic commit fence.
 if(!doc.createTime||!doc.updateTime||timeNs(doc.createTime)!==timeNs(doc.updateTime))throw new Error('Immutable journal system commit version required');
 const committed=timeNs(doc.createTime),requestTime=BigInt(stamp.seconds)*1000000000n+BigInt(stamp.nanoseconds);
 if(committed<timeNs(plan.activationReadTime)||committed>timeNs(plan.readTime)||requestTime>timeNs(plan.readTime))throw new Error('Journal event outside fixed sequence fence');return d.paths;
}
export function journalBatch(rows,plan,shard,start,stop){
 const wanted=new Map();for(let seq=start;seq<=stop;seq++)wanted.set(resource(plan.source,`${JOURNAL}/${eventId(plan.epoch,shard,seq)}`),seq);
 const documents=[];for(const row of rows){if(!row.found||!wanted.has(row.found.name))throw new Error('Missing, duplicate or foreign journal event');const seq=wanted.get(row.found.name);wanted.delete(row.found.name);journalEvent(row.found,plan,shard,seq);documents.push(row.found);}
 if(wanted.size)throw new Error('Journal sequence gap');return documents.sort((a,b)=>restFields(a.fields).seq-restFields(b.fields).seq);
}
export function pathStates(rows,source,paths,readTime){
 const wanted=new Map(paths.map(p=>[resource(source,p),p])),changed=[],deleted=[];
 for(const row of rows){const name=row.found?.name||row.missing,p=wanted.get(name);if(!p)throw new Error('Duplicate or foreign path state');wanted.delete(name);
  if(row.found){if(!row.found.createTime||!row.found.updateTime)throw new Error('Path state lacks original system version');if(timeNs(row.found.createTime)>timeNs(row.found.updateTime)||readTime&&timeNs(row.found.updateTime)>timeNs(readTime))throw new Error('Path state outside fixed system-version fence');changed.push(row.found);}else if(row.missing)deleted.push({path:p});else throw new Error('Path state response malformed');
 }
 if(wanted.size)throw new Error('Incomplete changed-path state capture');return {changed,deleted};
}
