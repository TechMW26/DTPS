import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeInlineFile,readGridFile,downloadSourceFile} from './media-source.mjs';
test('inline decoding rejects corrupt base64 and preserves binary bytes',()=>{
 assert.deepEqual(decodeInlineFile('data:image/png;base64,AAEC/w=='),Buffer.from([0,1,2,255]));
 assert.deepEqual(decodeInlineFile('AAEC/w'),Buffer.from([0,1,2,255]));
 assert.throws(()=>decodeInlineFile('%%broken'),/INVALID/);
 assert.throws(()=>decodeInlineFile('a'),/INVALID/);
 assert.throws(()=>decodeInlineFile('data:text/plain,hello'),/UNSUPPORTED/);
});
test('GridFS reassembly requires contiguous chunks and exact byte length',async()=>{
 let chunks=[{n:0,data:Buffer.from('abc')},{n:1,data:Buffer.from('de')}];
 const db={collection:()=>({find:()=>({sort:()=>chunks})})};
 const file={_id:'fixture',length:5,chunkSize:3};
 assert.equal((await readGridFile(db,'fixture',file)).toString(),'abcde');
 chunks=[chunks[1]];await assert.rejects(readGridFile(db,'fixture',file),/SEQUENCE/);
 chunks=[{n:0,data:Buffer.from('a')}];await assert.rejects(readGridFile(db,'fixture',file),/LENGTH/);
});
test('source downloads reject unknown hosts, redirected private networks, and HTML errors',async()=>{
 await assert.rejects(downloadSourceFile('https://127.0.0.1/private','image/png'),/HOST/);
 const previous=globalThis.fetch;
 try {
  globalThis.fetch=async()=>new Response(null,{status:302,headers:{location:'https://169.254.169.254/metadata'}});
  await assert.rejects(downloadSourceFile('https://dtps.tech/file','image/png'),/HOST/);
  globalThis.fetch=async()=>new Response('not a picture',{headers:{'content-type':'text/html'}});
  await assert.rejects(downloadSourceFile('https://dtps.tech/file','image/png'),/HTML/);
 }finally{globalThis.fetch=previous;}
});
