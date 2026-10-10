import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import zlib from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {bootstrapBaseline} from './bootstrap.mjs';
import {sqliteIndex} from './sqlite.mjs';
import {archiveDocuments,fileHash,mongoRecord,storageHash} from './archive.mjs';
import {baselineProof,checkDeltaFiles} from './delta-guard.mjs';
import {streamNames,fixedTimeStream} from './inventory-stream.mjs';

test('local system-time sweep captures create/update/delete and orphan paths without losing typed data',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'dtps-delta-')),base=path.join(dir,'base'),out=path.join(dir,'final'),index=path.join(dir,'baseline.sqlite');await fs.mkdir(base);await fs.mkdir(out);
 const source={project:'test',database:'db'},prefix='projects/test/databases/db/documents/',time='2026-01-01T00:00:00.123456789Z';
 const doc=(p,value)=>({name:prefix+p,createTime:time,updateTime:time,fields:{value:{stringValue:value},negativeZero:{doubleValue:'-0'},unsafe:{integerValue:'9223372036854775807'}}});
 const initial=[doc('users/a','old'),doc('users/delete','deleted'),doc('missing/parent/messages/orphan','preserved')],file=path.join(base,'documents.jsonl.gz');await fs.writeFile(file,zlib.gzipSync(initial.map(d=>JSON.stringify(d)).join('\n')+'\n'));
 const manifest={...source,complete:true,readTime:'2026-01-01T00:00:00.000Z',documents:3,files:[{file:'documents.jsonl.gz',sha256:await fileHash(file),records:3}]};await fs.writeFile(path.join(base,'manifest.json'),JSON.stringify(manifest));
 execFileSync('python3',[path.resolve('tools/mongodb-migration/baseline-index.py'),'build',base,index]);const local=sqliteIndex(index);
 try{
  await local.call('begin',{readTime:'2026-01-02T00:00:00.000Z'});const changed={...doc('users/a','new'),updateTime:'2026-01-02T00:00:00.000000001Z'},added=doc('users/new','new');
  const seen=await local.call('check',{documents:[changed,added,initial[2]].map(({fields,...metadata})=>metadata)});assert.deepEqual(seen.changed.sort(),[changed.name,added.name].sort());assert.equal(seen.unchanged,1);
  await local.call('apply',{documents:[changed,added]});await local.call('begin',{readTime:'2026-01-02T00:00:00.000Z'}); // Resume must preserve completed identity marks.
  const result=await local.call('finish',{output:out,expected:3});assert.equal(result.changed,2);assert.equal(result.deleted,1);assert.equal(result.documents,3);
  const full=[];for await(const d of archiveDocuments(path.join(out,'documents.jsonl.gz')))full.push(d);assert.equal(full.length,3);assert(full.some(d=>d.name===initial[2].name));const restored=full.find(d=>d.name===changed.name);assert.equal(storageHash(mongoRecord(restored,source,'test').data,mongoRecord(restored,source,'test')._types),storageHash(mongoRecord(changed,source,'test').data,mongoRecord(changed,source,'test')._types));
  const deleted=[];for await(const d of archiveDocuments(path.join(out,'deleted.jsonl.gz')))deleted.push(d);assert.deepEqual(deleted,[{path:'users/delete'}]);await assert.rejects(local.call('begin',{readTime:'2026-01-03T00:00:00.000Z'}),/another final capture/);
 }finally{await local.close();await fs.rm(dir,{recursive:true,force:true});}
});

test('final baseline proof requires complete source/database/run and matching shard checksums',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'dtps-proof-'));
 try{const file=path.join(dir,'proof.json'),files=[{file:'a.gz',sha256:'hash',records:10}],m={project:'p',database:'d',baselineReadTime:'t',baselineFiles:files};const proof={source:'p/d',database:'dtps',readTime:'t',run:'p/d@t',complete:true,verified:10,archiveFiles:files};await fs.writeFile(file,JSON.stringify(proof));assert.equal(baselineProof(m,file,'dtps',false).verified,10);assert.throws(()=>baselineProof(m,file,'other',false),/matching baseline/);assert.throws(()=>baselineProof(m,file,'dtps',true),/matching baseline/);await assert.rejects(checkDeltaFiles(dir,{deltaFiles:[]}),/Complete final delta/);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('single-pass inventory preserves unsorted identities and rejects duplicates/incomplete source counts',async()=>{
 async function* rows(){for(const path of ['messages/z','messages/a','missing/parent/messages/x'])yield {ref:{path}};}
 assert.deepEqual(await streamNames(rows(),'messages',3),['messages/z','messages/a','missing/parent/messages/x']);
 await assert.rejects(streamNames(rows(),'messages',4),/count differs/);
 async function* duplicate(){yield {ref:{path:'messages/a'}};yield {ref:{path:'messages/a'}};}
 await assert.rejects(streamNames(duplicate(),'messages',2),/duplicate/);
});

test('raw unsorted transport binds snapshot readTime and source identity without per-row SDK decoding',async()=>{
 let request;const db={formattedName:'projects/test/databases/db',_serializer:{},async initializeIfNeeded(){},async requestStream(method,_duplex,value){assert.equal(method,'executePipeline');request=value;return (async function*(){yield {results:[{name:'projects/test/databases/db/documents/messages/a',fields:{}}]};})();}};
 const timestamp={fromDate:date=>({toProto:()=>({timestampValue:{seconds:date.getTime()/1000,nanos:0}})})};
 const query={_toStructuredPipeline:()=>({_toProto:()=>({pipeline:{stages:[{name:'collection_group'},{name:'select'}]}})})};
 const stream=fixedTimeStream(null,db,timestamp,'2026-01-01T00:00:00.000Z');assert.deepEqual(await streamNames(stream(query),'messages',1),['messages/a']);assert.equal(request.readTime.seconds,1767225600);assert.deepEqual(request.structuredPipeline.pipeline.stages.map(s=>s.name),['collection_group','select']);
});

test('coherent partial bootstrap fetches missing banks, detects system changes despite unchanged business updatedAt, and rejects mixed capture times',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'dtps-bootstrap-')),base=path.join(dir,'base'),out=path.join(dir,'out'),index=path.join(dir,'index.sqlite');await fs.mkdir(base);await fs.mkdir(out);
 const source={project:'fixture',database:'db'},prefix='projects/fixture/databases/db/documents/',system='2026-10-01T00:00:00.000000001Z';
 const doc=(id,value)=>({name:prefix+id,createTime:system,updateTime:system,fields:{value:{stringValue:value},updatedAt:{timestampValue:'2026-09-01T00:00:00Z'}}}),old=doc('users/a','old'),gone=doc('users/deleted','old');
 const file=path.join(base,'users.jsonl.gz');await fs.writeFile(file,zlib.gzipSync([old,gone].map(d=>JSON.stringify(d)).join('\n')+'\n'));
 const manifest={...source,complete:false,readTime:'2026-10-01T00:01:00Z',documents:2,expectedDocuments:3,groups:[{collection:'users',total:2},{collection:'audit',total:1}],files:[{group:'users',file:'users.jsonl.gz',records:2,sha256:await fileHash(file)}]};await fs.writeFile(path.join(base,'manifest.json'),JSON.stringify(manifest));
 await assert.rejects(()=>bootstrapBaseline(base),/complete verified/);assert.deepEqual((await bootstrapBaseline(base,true)).bootstrapMissingGroups,['audit']);
 execFileSync('python3',[path.resolve('tools/mongodb-migration/baseline-index.py'),'build',base,index,'--allow-incomplete']);const local=sqliteIndex(index);
 try{const capture='2026-10-02T00:00:00Z',current={...old,updateTime:'2026-10-02T00:00:00.000000001Z',fields:{...old.fields,value:{stringValue:'new'}}},missing=doc('audit/not-in-partial','entire missing bank');assert.equal((await local.call('begin',{readTime:capture})).baseline.partialSource,true);const checks=await local.call('check',{documents:[current,missing].map(({fields,...d})=>d)});assert.equal(checks.unchanged,0);assert.deepEqual(checks.changed.sort(),[current.name,missing.name].sort());await local.call('apply',{documents:[current,missing]});await assert.rejects(()=>local.call('begin',{readTime:'2026-10-03T00:00:00Z'}),/another final capture/);const result=await local.call('finish',{output:out,expected:2});assert.equal(result.deleted,1);assert.equal(result.changed,2);assert.equal(result.groups.find(g=>g.collection==='audit').total,1);const full=[];for await(const d of archiveDocuments(path.join(out,'documents.jsonl.gz')))full.push(d);assert.deepEqual(full.find(d=>d.name===current.name).fields.updatedAt,old.fields.updatedAt);assert.equal(full.find(d=>d.name===current.name).updateTime,current.updateTime);assert(full.some(d=>d.name===missing.name));}
 finally{await local.close();await fs.rm(dir,{recursive:true,force:true});}
});

test('rebase proves every coherent archive payload and exact system version before creating a separate reusable baseline',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'dtps-rebase-')),base=path.join(dir,'base'),out=path.join(dir,'out'),index=path.join(dir,'old.sqlite'),rebased=path.join(dir,'new.sqlite');await fs.mkdir(base);await fs.mkdir(out);
 const source={project:'fixture',database:'db'},prefix='projects/fixture/databases/db/documents/',time='2026-01-01T00:00:00.123456789Z';
 const doc=id=>({name:prefix+id,createTime:time,updateTime:time,fields:{number:{integerValue:'9223372036854775807'},zero:{doubleValue:'-0'}}});const initial=[doc('users/a'),doc('users/deleted')],file=path.join(base,'documents.jsonl.gz');await fs.writeFile(file,zlib.gzipSync(initial.map(d=>JSON.stringify(d)).join('\n')+'\n'));
 await fs.writeFile(path.join(base,'manifest.json'),JSON.stringify({...source,complete:true,readTime:time,documents:2,files:[{file:'documents.jsonl.gz',records:2,sha256:await fileHash(file)}]}));execFileSync('python3',[path.resolve('tools/mongodb-migration/baseline-index.py'),'build',base,index]);const local=sqliteIndex(index),capture='2026-01-02T00:00:00.000Z';
 try{await local.call('begin',{readTime:capture});await local.call('check',{documents:[initial[0]]});const added=doc('missing/parent/messages/orphan');await local.call('apply',{documents:[added]});const result=await local.call('finish',{output:out,expected:2});const full=path.join(out,'documents.jsonl.gz'),manifest={...source,complete:true,readTime:capture,documents:2,groups:result.groups,collections:result.collections,files:[{file:'documents.jsonl.gz',records:2,sha256:await fileHash(full)}]};await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify(manifest));}
 finally{await local.close();}
 try{
  const proof=JSON.parse(execFileSync('python3',[path.resolve('tools/mongodb-migration/baseline-index.py'),'rebase',out,index,rebased],{encoding:'utf8'}));assert.equal(proof.complete,true);assert.equal(proof.documents,2);assert.equal(proof.locallyOmittedOldPaths,1);assert.equal(proof.groups,2);assert.equal(proof.payloadSha256.length,64);
  const fresh=sqliteIndex(rebased);try{const state=await fresh.call('begin',{readTime:'2026-01-03T00:00:00.000Z'});assert.equal(state.baseline.readTime,capture);assert.equal(state.baseline.partialSource,false);assert.equal((await fresh.call('check',{documents:[initial[0]]})).unchanged,1);}finally{await fresh.close();}
  assert.throws(()=>execFileSync('python3',[path.resolve('tools/mongodb-migration/baseline-index.py'),'rebase',out,index,index],{stdio:'pipe'}),/Command failed/);
  execFileSync('python3',['-c',"import sqlite3,sys,zlib;d=sqlite3.connect(sys.argv[1]);d.execute('UPDATE docs SET payload=? WHERE seen=1',(zlib.compress(b'corrupted'),));d.commit()",index]);const rejected=path.join(dir,'rejected.sqlite');assert.throws(()=>execFileSync('python3',[path.resolve('tools/mongodb-migration/baseline-index.py'),'rebase',out,index,rejected],{stdio:'pipe'}),/Command failed/);await assert.rejects(fs.stat(rejected));
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
