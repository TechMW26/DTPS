import {createHash} from 'node:crypto';
import {NextResponse} from 'next/server';
import {readNativeFile} from '@/lib/storage/migration-blob-storage';
function byteRange(range:string,size:number){
 const match=/^bytes=(\d*)-(\d*)$/.exec(range);
 if(!match||(!match[1]&&!match[2]))return null;
 let start=0,end=size-1;
 if(match[1]){start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),end):end;}
 else start=Math.max(0,size-Number(match[2]));
 return Number.isSafeInteger(start)&&Number.isSafeInteger(end)&&start<=end&&start<size?{start,end}:null;
}
const invalidRange=(size:number)=>new NextResponse(null,{status:416,headers:{'Content-Range':`bytes */${size}`,'Cache-Control':'private, no-store'}});
export async function nativeMediaResponse(media:Record<string,any>|null,request?:Request){
 if(!media)return new NextResponse('File not found or unavailable',{status:404,headers:{'Cache-Control':'private, no-store'}});
 if(media.blob){
  // The caller has already checked the live media ACL. Browsers may retain the
  // bytes, but must revalidate access before reusing them (including after logout).
  const type=media.mimeType||media.blob.contentType||'application/octet-stream';
  const filename=String(media.originalName||'file').replace(/[^a-zA-Z0-9._ -]/g,'_').slice(0,180);
  const etag=/^[a-f0-9]{64}$/i.test(media.blob.sha256||'')
   ? '"'+createHash('sha256').update(JSON.stringify([media.blob.sha256,type,filename])).digest('hex')+'"' : null;
  const cacheHeaders:Record<string,string>=etag?{'ETag':etag,'Cache-Control':'private, no-cache, must-revalidate','Vary':'Cookie, Authorization'}:{'Cache-Control':'private, no-store'};
  const matches=request?.headers.get('if-none-match')?.split(',').some(value=>value.trim().replace(/^W\//,'')===etag||value.trim()==='*');
  if(etag&&matches&&(!request||['GET','HEAD'].includes(request.method)))return new NextResponse(null,{status:304,headers:cacheHeaders});
  const range=request?.method==='HEAD'?null:request?.headers.get('range');
  // The reference size is server-owned metadata; reject impossible ranges before
  // paying for a whole-object download. Actual reads still validate size + SHA256.
  if(range&&Number.isSafeInteger(media.blob.size)&&media.blob.size>=0&&!byteRange(range,media.blob.size))return invalidRange(media.blob.size);
  const bytes=await readNativeFile(media.blob);
  const inline=/^(image\/(jpeg|png|webp|gif)|audio\/|video\/|application\/pdf)/.test(type);
  let start=0,end=bytes.length-1,status=200;
  if(range){
   const selected=byteRange(range,bytes.length);
   if(!selected)return invalidRange(bytes.length);
   ({start,end}=selected);status=206;
  }
  const download=request?new URL(request.url).searchParams.get('download'):null;
  return new NextResponse(request?.method==='HEAD'?null:new Uint8Array(bytes.subarray(start,end+1)),{status,headers:{'Accept-Ranges':'bytes',...(status===206?{'Content-Range':`bytes ${start}-${end}/${bytes.length}`} : {}),'Content-Type':type,'Content-Length':String(end-start+1),'Content-Disposition':`${inline&&!download?'inline':'attachment'}; filename="${filename}"`,...cacheHeaders,'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});
 }
 if(typeof media.url==='string'){
  const url=new URL(media.url);if(url.protocol==='https:'&&url.hostname.endsWith('.public.blob.vercel-storage.com'))return new NextResponse(null,{status:307,headers:{Location:url.href,'Cache-Control':'private, no-store'}});
 }
 return new NextResponse('Media reference unavailable',{status:503});
}
