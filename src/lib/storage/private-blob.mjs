import { createHash } from 'node:crypto';
import * as vercelBlob from '@vercel/blob';

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
  async function read(ref) {
    validate(ref);
    const result=await sdk.get(ref.pathname,{...auth,access:'private',useCache:false});
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
  async function store(bytes,contentType='application/octet-stream') {
    bytes=Buffer.from(bytes);
    const sha256=blobDigest(bytes),pathname=PREFIX+sha256;
    const ref={provider:'vercel-blob',storeId:config.storeId,pathname,url:urlFor(pathname),sha256,size:bytes.length,contentType};
    try {
      const written=await sdk.put(pathname,bytes,{...auth,access:'private',addRandomSuffix:false,allowOverwrite:false,contentType,multipart:bytes.length>5*1024*1024});
      if(!sameUrl(written.url,ref.url) || written.pathname!==pathname) throw new Error('Blob write used an unexpected store or path');
    } catch(error) {
      // Existing content is never overwritten. Concurrent/resumed copies must verify exactly.
      try {await read(ref);} catch {throw error;}
      return ref;
    }
    await read(ref);
    return ref;
  }
  return {store,read};
}
