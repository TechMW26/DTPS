import { createHash } from 'node:crypto';
import * as vercelBlob from '@vercel/blob';

// Runtime-only verified content cache; never cache access decisions or expose private bytes publicly.
const READ_CACHE_BYTES=32*1024*1024,READ_CACHE_ITEM_BYTES=8*1024*1024,READ_CACHE_TTL=30_000;
const verifiedReads=new Map(),pendingReads=new Map(),sdkIds=new WeakMap();
let retainedBytes=0,nextSdkId=0;
function removeCached(key){const entry=verifiedReads.get(key);if(entry){retainedBytes-=entry.bytes.length;verifiedReads.delete(key);}}
function retain(key,bytes){
  for(const [existing,entry] of verifiedReads)if(entry.expiresAt<=Date.now())removeCached(existing);
  removeCached(key);
  while(verifiedReads.size>=64||retainedBytes+bytes.length>READ_CACHE_BYTES)removeCached(verifiedReads.keys().next().value);
  verifiedReads.set(key,{bytes,expiresAt:Date.now()+READ_CACHE_TTL});retainedBytes+=bytes.length;
}

const PREFIX='dtps-native-staging/originals/';
export const blobDigest = bytes => createHash('sha256').update(bytes).digest('hex');

/** Explicit private-store credentials; never fall back to the app's public Blob token. */
export function createPrivateBlobArchive(config, sdk=vercelBlob) {
  if(!/^store_[A-Za-z0-9]+$/.test(config.storeId||'')) throw new Error('Explicit private Blob store ID required');
  if(!config.token && !config.oidcToken) throw new Error('Dedicated private Blob authentication required');
  const auth=config.token?{token:config.token}:{oidcToken:config.oidcToken,storeId:config.storeId};
  const hostname=config.storeId.slice(6).toLowerCase()+'.private.blob.vercel-storage.com';
  const urlFor=pathname=>'https://'+hostname+'/'+pathname;
  const sameUrl=(actual,expected)=>{
    try {return new URL(actual).href===new URL(expected).href;}catch{return false;}
  };
  function validate(ref) {
    if(ref.provider!=='vercel-blob' || ref.storeId!==config.storeId || !/^[a-f0-9]{64}$/.test(ref.sha256) ||
       ref.pathname!==PREFIX+ref.sha256 || ref.url!==urlFor(ref.pathname) || !Number.isSafeInteger(ref.size) || ref.size<0) {
      throw new Error('Invalid private Blob reference');
    }
  }
  const cacheReads=config.cacheReads===true;
  if(!sdkIds.has(sdk))sdkIds.set(sdk,++nextSdkId);
  const cacheScope=createHash('sha256').update(JSON.stringify([sdkIds.get(sdk),config.storeId,auth])).digest('hex');
  async function readOrigin(ref,fresh=false) {
    const result=await sdk.get(ref.pathname,{...auth,access:'private',useCache:cacheReads&&!fresh});
    // The SDK reports size=0 when CDN compression removes Content-Length.
    // Verify the decoded stream's byte length and digest below instead.
    if(!result || result.statusCode!==200 || !sameUrl(result.blob.url,ref.url) || result.blob.pathname!==ref.pathname) {
      if(result?.stream) await result.stream.cancel();
      throw new Error('Private Blob is missing or its store, path or size changed');
    }
    const reader=result.stream.getReader(),parts=[];
    let length=0;
    try {
      for(;;) {
        const {done,value}=await reader.read();if(done)break;
        length+=value.byteLength;
        if(length>ref.size) throw new Error('Private Blob exceeds expected size');
        parts.push(Buffer.from(value));
      }
    } catch(error) {await reader.cancel().catch(()=>{});throw error;}
    finally {reader.releaseLock();}
    const bytes=Buffer.concat(parts);
    if(bytes.length!==ref.size || blobDigest(bytes)!==ref.sha256) throw new Error('Private Blob checksum mismatch');
    return bytes;
  }
  async function read(ref,{fresh=false}={}) {
    validate(ref);
    const key=cacheScope+':'+ref.sha256+':'+ref.size;
    if(!cacheReads||fresh||ref.size>READ_CACHE_ITEM_BYTES){
      if(fresh)removeCached(key);
      return readOrigin(ref,fresh);
    }
    const cached=verifiedReads.get(key);
    if(cached&&cached.expiresAt>Date.now()){
      verifiedReads.delete(key);verifiedReads.set(key,cached);
      return Buffer.from(cached.bytes);
    }
    removeCached(key);
    const pending=pendingReads.get(key);
    if(pending)return Buffer.from(await pending);
    // Bound in-flight cache population as well as retained memory.
    if(pendingReads.size>=4)return readOrigin(ref);
    const loading=readOrigin(ref).then(bytes=>{retain(key,bytes);return bytes;});
    pendingReads.set(key,loading);
    try{return Buffer.from(await loading);}finally{if(pendingReads.get(key)===loading)pendingReads.delete(key);}
  }
  async function store(bytes,contentType='application/octet-stream') {
    bytes=Buffer.from(bytes);
    const sha256=blobDigest(bytes),pathname=PREFIX+sha256;
    const ref={provider:'vercel-blob',storeId:config.storeId,pathname,url:urlFor(pathname),sha256,size:bytes.length,contentType};
    try {
      const written=await sdk.put(pathname,bytes,{...auth,access:'private',addRandomSuffix:false,allowOverwrite:false,contentType,multipart:bytes.length>5*1024*1024});
      if(!sameUrl(written.url,ref.url) || written.pathname!==pathname) throw new Error('Blob write used an unexpected store or path');
    } catch(error) {
      // Existing content is never overwritten. Concurrent/resumed copies must verify exactly.
      try {await read(ref,{fresh:true});} catch {throw error;}
      return ref;
    }
    await read(ref,{fresh:true});
    return ref;
  }
  return {store,read};
}
