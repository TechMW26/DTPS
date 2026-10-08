import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrivateBlobArchive} from '../../src/lib/storage/private-blob.mjs';

function fixture(cacheReads=false) {
  const files=new Map(),reads=[];
  const sdk={
    async put(path,bytes,options) {
      assert.equal(options.access,'private');assert.equal(options.allowOverwrite,false);
      if(files.has(path))throw new Error('already exists');
      files.set(path,Buffer.from(bytes));
      return {url:'https://TeSt.private.blob.vercel-storage.com/'+path,pathname:path};
    },
    async get(path,options) {
      assert.equal(options.access,'private');reads.push(options);
      const bytes=files.get(path);if(!bytes)return null;
      return {statusCode:200,blob:{size:0,url:'https://TeSt.private.blob.vercel-storage.com/'+path,pathname:path},stream:new ReadableStream({start(c){c.enqueue(bytes);c.close();}})};
    },
  };
  return {files,reads,sdk,store:createPrivateBlobArchive({storeId:'store_test',token:'synthetic-only',cacheReads},sdk)};
}
test('uploads immutable private objects, verifies bytes, and safely resumes',async()=>{
  const {store,files}=fixture(),bytes=Buffer.alloc(1_200_000,27);
  const first=await store.store(bytes,'application/pdf');
  assert.deepEqual(await store.read(first),bytes);
  assert.deepEqual(await store.store(bytes,'application/pdf'),first);
  assert.equal(files.size,1);
  await assert.rejects(store.read({...first,storeId:'store_other'}),/reference/);
  await assert.rejects(store.read({...first,url:'https://external.invalid/file'}),/reference/);
});
test('detects corruption without overwriting the only stored copy',async()=>{
  const {store,files}=fixture(),bytes=Buffer.from('original');
  const ref=await store.store(bytes);
  files.set(ref.pathname,Buffer.from('tampered'));
  await assert.rejects(store.read(ref),/checksum/);
  await assert.rejects(store.store(bytes));
  assert.equal(files.get(ref.pathname).toString(),'tampered');
});
test('requires explicit private-store authentication',()=>{
  assert.throws(()=>createPrivateBlobArchive({storeId:'store_test'}),/authentication/);
});

test('runtime reads coalesce and reuse only verified immutable bytes, preserving fresh writes',async()=>{
 const {store,reads,files,sdk}=fixture(true),bytes=Buffer.from('verified content');
 const ref=await store.store(bytes);assert.equal(reads[0].useCache,false);
 reads.length=0;
 const copies=await Promise.all(Array.from({length:8},()=>store.read(ref)));
 assert.equal(reads.length,1);assert.equal(reads[0].useCache,true);
 copies[0].fill(0);assert.deepEqual(await store.read(ref),bytes);
 assert.deepEqual(copies[1],bytes);
 const second=createPrivateBlobArchive({storeId:'store_test',token:'synthetic-only',cacheReads:true},sdk);
 assert.deepEqual(await second.read(ref),bytes);assert.equal(reads.length,1);
 // Rotated credentials cannot inherit an earlier authorization's byte cache.
 const rotated=createPrivateBlobArchive({storeId:'store_test',token:'rotated-synthetic',cacheReads:true},sdk);
 await rotated.read(ref);assert.equal(reads.length,2);
 files.set(ref.pathname,Buffer.from('bad'));
 await assert.rejects(store.store(bytes));assert.equal(reads.at(-1).useCache,false);
 await assert.rejects(store.read({...ref,size:999}),/checksum/);
});
test('runtime read cache expires and never retains failed checksums',async()=>{
 const {store,files,reads}=fixture(true),bytes=Buffer.from('expiring');
 const ref=await store.store(bytes);await store.read(ref);
 const originalNow=Date.now;
 try{
  const future=originalNow()+31000;Date.now=()=>future;
  files.set(ref.pathname,Buffer.from('bad'));
  await assert.rejects(store.read(ref),/checksum/);
  files.set(ref.pathname,bytes);assert.deepEqual(await store.read(ref),bytes);
  assert.equal(reads.length,4);
 }finally{Date.now=originalNow;}
});
test('large runtime blobs bypass retained bytes and memory remains bounded',async()=>{
 const {store,reads}=fixture(true),large=Buffer.alloc(8*1024*1024+1,7),ref=await store.store(large);
 await store.read(ref);await store.read(ref);assert.equal(reads.length,3);
 const refs=[];
 for(let i=0;i<5;i++){const next=await store.store(Buffer.alloc(8*1024*1024,i));refs.push(next);await store.read(next);}
 const before=reads.length;await store.read(refs[0]);assert.equal(reads.length,before+1);
});
