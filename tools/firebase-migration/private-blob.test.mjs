import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrivateBlobArchive} from '../../src/lib/storage/private-blob.mjs';

function fixture() {
  const files=new Map();
  const sdk={
    async put(path,bytes,options) {
      assert.equal(options.access,'private');assert.equal(options.allowOverwrite,false);
      if(files.has(path))throw new Error('already exists');
      files.set(path,Buffer.from(bytes));
      return {url:'https://TeSt.private.blob.vercel-storage.com/'+path,pathname:path};
    },
    async get(path,options) {
      assert.equal(options.access,'private');
      const bytes=files.get(path);if(!bytes)return null;
      return {statusCode:200,blob:{size:0,url:'https://TeSt.private.blob.vercel-storage.com/'+path,pathname:path},stream:new ReadableStream({start(c){c.enqueue(bytes);c.close();}})};
    },
  };
  return {files,store:createPrivateBlobArchive({storeId:'store_test',token:'synthetic-only'},sdk)};
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
