import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {gzipSync} from 'node:zlib';
import {fileHash} from './archive.mjs';
import {journalPlan,journalBatch,counterVector,pathStates,eventId,counterId,resource,SHARDS,JOURNAL,COUNTERS} from './journal-guard.mjs';
import {sqliteIndex} from './sqlite.mjs';
const source={project:'fixture',database:'db'},epoch='fixture_epoch',time='2026-10-10T10:00:00.000000000Z',later='2026-10-10T10:05:00.000000000Z';
function fixture(){const activation={...source,complete:true,epoch,coverageConfirmed:true,activatedAt:time,readTime:time,vector:Array(SHARDS).fill(0),missingCounterShards:[]},baseline={...source,complete:true,readTime:'2026-10-10T10:01:00Z',files:[{file:'full.gz',records:1,sha256:'hash'}]},end={...source,complete:true,epoch,readTime:later,vector:Array(SHARDS).fill(0),writersGated:true,writeGateTime:'2026-10-10T10:04:59.999999999Z'};end.vector[3]=2;return {activation,baseline,end,plan:journalPlan(activation,baseline,end)};}
const fields=(shard,seq,paths)=>({epoch:{stringValue:epoch},shard:{integerValue:String(shard)},seq:{integerValue:String(seq)},sourceProject:{stringValue:source.project},sourceDatabase:{stringValue:source.database},paths:{arrayValue:{values:paths.map(stringValue=>({stringValue}))}},committedAt:{timestampValue:'2026-10-10T10:03:00.123456789Z'}});
const event=(seq,paths=['users/a'])=>({name:resource(source,`${JOURNAL}/${eventId(epoch,3,seq)}`),fields:fields(3,seq,paths),createTime:'2026-10-10T10:03:00.123456789Z',updateTime:'2026-10-10T10:03:00.123456789Z'});
test('journal proof requires covered activation, later complete baseline, bounded safe vectors and exact nanosecond gate',()=>{
 const {activation,baseline,end,plan}=fixture();assert.equal(plan.events,2);assert.equal(plan.final,true);assert.equal(journalPlan(activation,baseline,{...end,writersGated:false}).final,false);
 assert.throws(()=>journalPlan({...activation,coverageConfirmed:false},baseline,end),/coverage/);assert.throws(()=>journalPlan(activation,{...baseline,readTime:'2026-10-10T09:59:59Z'},end),/Preactivation/);
 assert.equal(journalPlan({...activation,missingCounterShards:[1]},baseline,{...end,missingCounterShards:[1]}).events,2);assert.throws(()=>journalPlan({...activation,missingCounterShards:[1]},baseline,{...end,missingCounterShards:[3]}),/idle/);
 assert.throws(()=>journalPlan(activation,baseline,{...end,vector:[0]}),/16/);assert.throws(()=>journalPlan(activation,baseline,end,1),/budget/);assert.throws(()=>journalPlan({...activation,missingCounterShards:[3],vector:activation.vector.map((v,s)=>s===3?1:v)},baseline,end),/zeros/);
 assert.throws(()=>journalPlan(activation,baseline,{...end,writeGateTime:'2026-10-10T10:05:00.000000001Z'}),/writer gate/);assert.throws(()=>journalPlan({...activation,vector:activation.vector.map((v,s)=>s===3?3:v)},baseline,end),/backwards/);
});
test('deterministic journal batch proves every sequence and rejects gaps, source mismatch, duplicate paths and fence violations',()=>{
 const {plan}=fixture();assert.deepEqual(journalBatch([{found:event(2,['missing/parent/messages/orphan'])},{found:event(1)}],plan,3,1,2).map(d=>d.name),[event(1).name,event(2).name]);
 assert.throws(()=>journalBatch([{found:event(1)}],plan,3,1,2),/gap/);assert.throws(()=>journalBatch([{missing:event(1).name},{found:event(2)}],plan,3,1,2),/Missing/);assert.throws(()=>journalBatch([{found:event(1)},{found:event(1)}],plan,3,1,2),/duplicate/);
 assert.throws(()=>journalBatch([{found:event(1,['users/a','users/a'])}],plan,3,1,1),/protocol/);assert.throws(()=>journalBatch([{found:event(1,['_nativeMigrationJournal/a'])}],plan,3,1,1),/protocol/);assert.throws(()=>journalBatch([{found:event(1,['users/a/invalid'])}],plan,3,1,1),/protocol/);
 assert.equal(journalBatch([{found:event(1,['users/a/_nativeMigrationJournalNotes/business'])}],plan,3,1,1).length,1);
 const wrong=event(1);wrong.fields.sourceDatabase={stringValue:'other'};assert.throws(()=>journalBatch([{found:wrong}],plan,3,1,1),/protocol/);const future=event(1);future.createTime=future.updateTime='2026-10-10T10:05:00.000000001Z';assert.throws(()=>journalBatch([{found:future}],plan,3,1,1),/fence/);
 const rounded=event(1);rounded.fields.committedAt={timestampValue:'2026-10-10T10:03:00.123Z'};assert.equal(journalBatch([{found:rounded}],plan,3,1,1).length,1);const altered=event(1);altered.updateTime=later;assert.throws(()=>journalBatch([{found:altered}],plan,3,1,1),/Immutable/);
});
test('counter vector allows only explicitly proved activation zeros; later holes and mismatch are fatal',()=>{
 const {activation,end}=fixture();const rows=proof=>Array.from({length:SHARDS},(_,shard)=>({found:{name:resource(source,`${COUNTERS}/${counterId(epoch,shard)}`),createTime:time,updateTime:proof.readTime,fields:{epoch:{stringValue:epoch},shard:{integerValue:String(shard)},seq:{integerValue:String(proof.vector[shard])},sourceProject:{stringValue:source.project},sourceDatabase:{stringValue:source.database}}}}));
 assert.deepEqual(counterVector(rows(end),end),end.vector);const initial=rows(activation);initial[1]={missing:initial[1].found.name};assert.throws(()=>counterVector(initial,activation,true),/hole/);assert.deepEqual(counterVector(initial,{...activation,missingCounterShards:[1]},true),activation.vector);assert.throws(()=>counterVector(initial,{...activation,missingCounterShards:[1]}),/hole/);const mismatched=rows(end);mismatched[3].found.fields.seq={integerValue:'1'};assert.throws(()=>counterVector(mismatched,end),/differs/);const idle=rows(end);idle[1]={missing:idle[1].found.name};assert.deepEqual(counterVector(idle,{...end,missingCounterShards:[1]},true),end.vector);const disappeared=rows(end);disappeared[3]={missing:disappeared[3].found.name};assert.throws(()=>counterVector(disappeared,{...end,missingCounterShards:[1]},true),/hole/);
});
test('source path-state capture preserves typed fields and orphan paths; authoritative missing creates hard-delete tombstones',()=>{
 const doc={name:resource(source,'missing/parent/messages/orphan'),fields:{number:{integerValue:'9223372036854775807'},timestamp:{timestampValue:'2026-10-10T10:02:00.123456789Z'},zero:{doubleValue:'-0'}},createTime:time,updateTime:later};
 assert.deepEqual(pathStates([{missing:resource(source,'users/deleted')},{found:doc}],source,['users/deleted','missing/parent/messages/orphan']),{changed:[doc],deleted:[{path:'users/deleted'}]});assert.throws(()=>pathStates([{found:doc}],source,['users/deleted','missing/parent/messages/orphan']),/Incomplete/);assert.throws(()=>pathStates([{missing:resource(source,'other/path')}],source,['users/deleted']),/foreign/);assert.throws(()=>pathStates([{found:doc}],source,['missing/parent/messages/orphan'],'2026-10-10T10:04:59.999999999Z'),/fence/);
});
test('durable sequence receipts deduplicate repeated paths, preserve nested paths and reject altered resume identity/content',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'dtps-journal-')),local=sqliteIndex(path.join(dir,'paths.sqlite'),{journal:true});
 try{const identity={epoch,start:Array(SHARDS).fill(0),readTime:later};await local.call('begin',{identity});const first={shard:3,seq:1,hash:'one',paths:['users/a','missing/parent/messages/orphan']};await local.call('events',{events:[first,{shard:3,seq:2,hash:'two',paths:['users/a','users/deleted']}]});await local.call('events',{events:[first]});assert.deepEqual(await local.call('counts'),{events:2,paths:3});assert.deepEqual(await local.call('paths',{limit:2}),{paths:['missing/parent/messages/orphan','users/a']});assert.deepEqual(await local.call('paths',{after:'users/a',limit:2}),{paths:['users/deleted']});await assert.rejects(local.call('begin',{identity:{...identity,readTime:time}}),/another journal fence/);await assert.rejects(local.call('events',{events:[{...first,hash:'altered',paths:['users/should-not-appear']}]}),/content differs/);assert.deepEqual(await local.call('counts'),{events:2,paths:3});await assert.rejects(local.call('paths',{limit:301}),/Bounded/);
 }finally{await local.close();await fs.rm(dir,{recursive:true,force:true});}
});
test('journal CLI defaults to local-only dry-run with no output or source credentials, rejecting a preactivation baseline',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'dtps-journal-dry-'));try{const {activation,baseline,end}=fixture(),file=path.join(dir,'full.gz');await fs.writeFile(file,gzipSync('{}\n'));baseline.files=[{file:'full.gz',records:1,sha256:await fileHash(file)}];baseline.documents=1;await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify(baseline));const a=path.join(dir,'activation.json'),e=path.join(dir,'end.json'),out=path.join(dir,'output');await fs.writeFile(a,JSON.stringify(activation));await fs.writeFile(e,JSON.stringify(end));
  const args=[path.resolve('tools/mongodb-migration/capture-journal.mjs'),'--activation-proof',a,'--end-vector',e,'--baseline',dir,'--output',out],result=JSON.parse(execFileSync(process.execPath,args,{encoding:'utf8'}));assert.equal(result.capture,false);assert.equal(result.readonly,true);assert.equal(result.events,2);await assert.rejects(fs.stat(out));
  baseline.readTime='2026-10-10T09:59:59Z';await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify(baseline));assert.throws(()=>execFileSync(process.execPath,args,{stdio:'pipe'}),/Command failed/);await assert.rejects(fs.stat(out));
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
