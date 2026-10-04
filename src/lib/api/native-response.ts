import {createHash} from 'node:crypto';
import {NextResponse} from 'next/server';
const imageKitUrl=/https?:\/\/(?:ik\.imagekit\.io\/|dtps\.tech\/uploads\/)[^\s<>"'`]+/gi;
/** Response projection only. Keep original source URLs in persisted documents and audit records. */
export function nativeResponsePayload<T>(value:T):T{
 function visit(item:any):any{
  if(typeof item==='string')return item.replace(imageKitUrl,raw=>{try{const url=new URL(raw.replace(/&amp;/g,'&'));return '/api/media/'+createHash('sha256').update(url.href).digest('hex');}catch{return raw;}});
  if(Array.isArray(item))return item.map(visit);
  if(item&&typeof item==='object'&&(Object.getPrototypeOf(item)===Object.prototype||Object.getPrototypeOf(item)===null))return Object.fromEntries(Object.entries(item).filter(([key])=>!['_nativeExternalFields','_nativeSource'].includes(key)).map(([key,child])=>[key,visit(child)]));
  return item;
 }
 return visit(value);
}
export function nativeResponseJson<T>(body:T,init?:Parameters<typeof NextResponse.json>[1]){return NextResponse.json(nativeResponsePayload(body),init);}
