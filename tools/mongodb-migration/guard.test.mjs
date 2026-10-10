import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {archiveLock} from './archive-lock.mjs';
import {fileHash} from './archive.mjs';
const run=(script,args)=>execFileSync(process.execPath,[path.resolve('tools/mongodb-migration/'+script),...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']});

test('compact refuses mismatched verification, then previews only transient metadata removal',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'dtps-mongo-guard-test-'));
 try{
  const dataFile=path.join(dir,'documents.jsonl.gz');await fs.writeFile(dataFile,zlib.gzipSync('{}\n'));const sha=await fileHash(dataFile),source='test/db',snapshot='2026-01-01T00:00:00.000Z',runId=source+'@'+snapshot;
  const manifest={complete:true,project:'test',database:'db',readTime:snapshot,documents:1,files:[{file:'documents.jsonl.gz',sha256:sha,records:1}]};
  const state={complete:true,database:'guard_test',source,run:runId,documents:1,completedFiles:{'documents.jsonl.gz':sha}};
  const verify={complete:true,database:'guard_test',source,run:'different',readTime:snapshot,verified:1,archiveFiles:manifest.files,groups:{users:1}};
  await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify(manifest));await fs.writeFile(path.join(dir,'mongo-import-guard_test.json'),JSON.stringify(state));await fs.writeFile(path.join(dir,'mongo-verification-guard_test.json'),JSON.stringify(verify));
  assert.throws(()=>run('compact.mjs',['--archive',dir,'--database','guard_test']),/Matching complete import and verification/);
  verify.run=runId;await fs.writeFile(path.join(dir,'mongo-verification-guard_test.json'),JSON.stringify(verify));const preview=JSON.parse(run('compact.mjs',['--archive',dir,'--database','guard_test']));assert.equal(preview.dryRun,true);assert.deepEqual(preview.removedFields,['_sourceHash','_storageHash','_migrationRun']);assert(!preview.removedFields.includes('_types'));assert(!preview.removedFields.includes('data'));
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('index preview has an explicit budget and operational TTL is deferred until enabled',()=>{
 const preview=JSON.parse(run('indexes.mjs',[]));assert.equal(preview.dryRun,true);assert.equal(preview.operationalTTLDeferred,true);assert.equal(preview.indexes,34);assert(preview.indexes<=preview.budget);assert(preview.specifications.every(s=>!s.unique&&s.expireAfterSeconds===undefined));
 const ttl=JSON.parse(run('indexes.mjs',['--enable-operational-ttl']));assert.equal(ttl.indexes,35);assert.equal(ttl.specifications.filter(s=>s.expireAfterSeconds===0).length,1);
 assert.throws(()=>run('indexes.mjs',['--max-indexes','10']),/Index count exceeds/);
});

test('dedicated target credentials override stale environments and reject a different Atlas host without exposing URI',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'dtps-target-'));
 try{const file=path.join(dir,'target.env');await fs.writeFile(file,'MONGODB_URI=mongodb+srv://migration:fake-private-test@dtpscluster.fav0awp.mongodb.net/\nMONGODB_DATABASE=dtps\n');const out=run('indexes.mjs',['--credentials-file',file]);assert.equal(JSON.parse(out).dryRun,true);assert(!out.includes('fake-private-test'));assert(!out.includes('mongodb+srv'));await fs.writeFile(file,'MONGODB_URI=mongodb+srv://migration:fake-private-test@other.mongodb.net/\n');assert.throws(()=>run('indexes.mjs',['--credentials-file',file]),/does not match the approved/);await fs.writeFile(file,'MONGODB_DATABASE=dtps\n');assert.throws(()=>run('indexes.mjs',['--credentials-file',file]),/has no MongoDB URI/);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('approved Atlas host cannot write into the website database',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'dtps-target-db-'));
 try{const file=path.join(dir,'target.env');await fs.writeFile(file,'MONGODB_URI=mongodb+srv://migration:fake-private-test@dtpscluster.fav0awp.mongodb.net/\nMONGODB_DATABASE=dtps_website\n');assert.throws(()=>run('indexes.mjs',['--credentials-file',file,'--execute']),/restricted to the dtps database/);await fs.writeFile(file,'MONGODB_URI=mongodb+srv://migration:fake-private-test@dtpscluster.fav0awp.mongodb.net/\nMONGODB_DATABASE=dtps\n');assert.throws(()=>run('indexes.mjs',['--credentials-file',file,'--database','dtps_website','--execute']),/restricted to the dtps database/);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('archive checkpoints refuse concurrent owners and release only their own lock',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'dtps-worker-lock-'));
 try{const release=archiveLock(dir,'export');assert.throws(()=>archiveLock(dir,'export'),/already owns/);release();archiveLock(dir,'export')();assert.deepEqual(await fs.readdir(dir),[]);}
 finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('index creation retries a transient primary transition but fails permanent index errors without repeating writes',async()=>{
 const {createIndexWithRetry}=await import('./indexes.mjs');let calls=0;
 const transient={async createIndex(){calls++;if(calls===1)throw Object.assign(new Error('fixture primary transition'),{code:11602});return 'fixture_index';}};
 assert.equal(await createIndexWithRetry(transient,{field:1},{name:'fixture_index'}),'fixture_index');assert.equal(calls,2);
 let permanentCalls=0;await assert.rejects(createIndexWithRetry({async createIndex(){permanentCalls++;throw Object.assign(new Error('fixture permanent conflict'),{code:11000});}},{field:1},{name:'fixture_index'}),/permanent conflict/);assert.equal(permanentCalls,1);
});
