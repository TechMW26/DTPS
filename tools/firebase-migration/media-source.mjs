export function decodeInlineFile(value) {
  if(Buffer.isBuffer(value))return value;
  if(value?._bsontype==='Binary')return Buffer.from(value.value());
  if(typeof value!=='string' || !value.length)throw new Error('INLINE_DATA_MISSING');
  let encoded=value;
  if(encoded.startsWith('data:')) {
    const comma=encoded.indexOf(',');
    if(comma<0 || !encoded.slice(0,comma).endsWith(';base64'))throw new Error('INLINE_ENCODING_UNSUPPORTED');
    encoded=encoded.slice(comma+1);
  }
  encoded=encoded.replace(/\s/g,'');
  if(!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || encoded.length%4===1)throw new Error('INLINE_BASE64_INVALID');
  const bytes=Buffer.from(encoded,'base64');
  if(bytes.toString('base64').replace(/=+$/,'')!==encoded.replace(/=+$/,''))throw new Error('INLINE_BASE64_INVALID');
  return bytes;
}

export async function readGridFile(db,bucket,file) {
  const parts=[];let count=0,bytes=0;
  for await(const chunk of db.collection(bucket+'.chunks').find({files_id:file._id}).sort({n:1})) {
    if(chunk.n!==count++)throw new Error('GRIDFS_CHUNK_SEQUENCE_INVALID');
    const value=Buffer.isBuffer(chunk.data)?chunk.data:Buffer.from(chunk.data.value());
    if(value.length>file.chunkSize || bytes+value.length>file.length)throw new Error('GRIDFS_CHUNK_SIZE_INVALID');
    bytes+=value.length;parts.push(value);
  }
  if(bytes!==file.length)throw new Error('GRIDFS_LENGTH_MISMATCH');
  return Buffer.concat(parts);
}

const hosts=new Set(['dtps.tech','www.dtps.tech','ik.imagekit.io','n1ryg7cslgpozeiu.public.blob.vercel-storage.com']);
export async function downloadSourceAsset(source,mimeType) {
  let url=new URL(source.startsWith('/')?'https://dtps.tech'+source:source);
  for(let hop=0;hop<6;hop++) {
    if(url.protocol!=='https:' || url.port || url.username || url.password || !hosts.has(url.hostname))throw new Error('SOURCE_HOST_NOT_APPROVED');
    const response=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(60_000)});
    if([301,302,303,307,308].includes(response.status)) {
      const location=response.headers.get('location');await response.body?.cancel();
      if(!location)throw new Error('SOURCE_REDIRECT_INVALID');url=new URL(location,url);continue;
    }
    if(!response.ok){await response.body?.cancel();throw new Error('SOURCE_HTTP_'+response.status);}
    if(response.headers.get('content-type')?.includes('text/html') && mimeType!=='text/html') {await response.body?.cancel();throw new Error('SOURCE_RETURNED_HTML');}
    const limit=256*1024*1024;
    if(Number(response.headers.get('content-length'))>limit){await response.body?.cancel();throw new Error('SOURCE_SIZE_LIMIT');}
    if(!response.body)throw new Error('SOURCE_BODY_MISSING');
    const reader=response.body.getReader(),parts=[];let size=0;
    try {
      for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit)throw new Error('SOURCE_SIZE_LIMIT');parts.push(Buffer.from(value));}
    }catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
    return {bytes:Buffer.concat(parts),contentType:response.headers.get('content-type')?.split(';')[0]||mimeType||'application/octet-stream'};
  }
  throw new Error('SOURCE_REDIRECT_LOOP');
}

export async function downloadSourceFile(source,mimeType){return (await downloadSourceAsset(source,mimeType)).bytes;}
