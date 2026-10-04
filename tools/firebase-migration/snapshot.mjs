import fs from 'node:fs';
import {createGzip,createGunzip} from 'node:zlib';
import {createHash} from 'node:crypto';
import {pipeline} from 'node:stream/promises';
import {once} from 'node:events';

/** Concatenated BSON preserves every byte/type, including invalid dates and binary originals. */
export async function writeSnapshot(rawCursor,file) {
  const gzip=createGzip({level:6});
  const output=fs.createWriteStream(file,{mode:0o600,flags:'wx'});
  const done=pipeline(gzip,output);
  // Attach immediately so a disk error cannot become an unhandled rejection during source reads.
  done.catch(()=>{});
  const hash=createHash('sha256');let count=0,bytes=0;
  try {
    for await(const raw of rawCursor) {
      hash.update(raw);count++;bytes+=raw.length;
      if(!gzip.write(raw))await once(gzip,'drain');
    }
    gzip.end();await done;
    return {count,bytes,sha256:hash.digest('hex')};
  } catch(error) {gzip.destroy(error);await done.catch(()=>{});throw error;}
}

export async function verifySnapshot(file,expected) {
  const hash=createHash('sha256');let count=0,bytes=0;
  for await(const raw of readSnapshot(file)) {
    hash.update(raw);bytes+=raw.length;count++;
  }
  const sha256=hash.digest('hex');
  if(count!==expected.count || bytes!==expected.bytes || sha256!==expected.sha256)throw new Error('Snapshot integrity check failed');
  return {count,bytes,sha256};
}

export async function* readSnapshot(file) {
  const input=fs.createReadStream(file),stream=createGunzip();
  const done=pipeline(input,stream);done.catch(()=>{});
  let remaining=Buffer.alloc(0);
  try {
    for await(const chunk of stream) {
      remaining=Buffer.concat([remaining,chunk]);
    while(remaining.length>=4) {
      const size=remaining.readInt32LE(0);
      if(size<5 || size>16*1024*1024)throw new Error('Invalid BSON snapshot frame');
      if(remaining.length<size)break;
      if(remaining[size-1]!==0)throw new Error('Invalid BSON snapshot terminator');
      yield Buffer.from(remaining.subarray(0,size));remaining=remaining.subarray(size);
    }
    }
    await done;
    if(remaining.length)throw new Error('Truncated BSON snapshot');
  } finally {input.destroy();stream.destroy();await done.catch(()=>{});}
}
