import {Timestamp,GeoPoint} from 'firebase-admin/firestore';
import {Long,Binary,Double} from 'mongodb';
export const typeKey=path=>Buffer.from(JSON.stringify(path)).toString('base64url');
export function encodeMongoData(input){
 const types={};
 function encode(value,path){
  if(value===undefined)throw new Error('Undefined database value');
  if(typeof value==='bigint')return Long.fromBigInt(value);
  if(Object.is(value,-0))return new Double(-0);
  if(Object.prototype.toString.call(value)==='[object Date]'||value instanceof Timestamp||value&&typeof value.toDate==='function'&&Number.isInteger(value._seconds)){
   const t=Object.prototype.toString.call(value)==='[object Date]'?Timestamp.fromDate(value):value;const seconds=t.seconds??t._seconds,nanos=t.nanoseconds??t._nanoseconds;
   types[typeKey(path)]={kind:'timestamp',seconds,nanos};return new Date(seconds*1000+Math.floor(nanos/1e6));
  }
  if(value instanceof GeoPoint){types[typeKey(path)]={kind:'geo'};return {latitude:value.latitude,longitude:value.longitude};}
  if(value&&typeof value._firestoreReference==='string'){types[typeKey(path)]={kind:'reference',resource:value._firestoreReference};return value._firestoreReference.split('/documents/').at(-1);}
  if(value&&typeof value.path==='string'&&typeof value.get==='function'&&value.constructor.name.includes('DocumentReference')){types[typeKey(path)]={kind:'reference',resource:value.path};return value.path;}
  if(Buffer.isBuffer(value)||value instanceof Uint8Array)return Buffer.from(value);
  if(value instanceof Long||value instanceof Binary||value instanceof Double)return value;
  if(Array.isArray(value))return value.map((v,i)=>encode(v,[...path,String(i)]));
  if(value&&typeof value==='object'){const out=Object.create(null);for(const [key,v]of Object.entries(value))Object.defineProperty(out,key,{value:encode(v,[...path,key]),enumerable:true,writable:true,configurable:true});return out;}
  return value;
 }
 return {data:encode(input,[]),types};
}
export function decodeMongoData(data,types={},reference){
 function decode(value,path){const tag=types[typeKey(path)];
  if(tag?.kind==='timestamp')return new Timestamp(tag.seconds,tag.nanos);
  if(tag?.kind==='geo')return new GeoPoint(value.latitude,value.longitude);
  if(tag?.kind==='reference'){if(!reference)return {_firestoreReference:tag.resource};const ref=reference(tag.resource.split('/documents/').at(-1));Object.defineProperty(ref,'_firestoreReference',{value:tag.resource,enumerable:false,configurable:true});return ref;}
  if(Object.prototype.toString.call(value)==='[object Date]')return Timestamp.fromDate(value);
  if(value instanceof Binary)return Buffer.from(value.buffer);
  if(value instanceof Long){const n=value.toBigInt();return n<=BigInt(Number.MAX_SAFE_INTEGER)&&n>=BigInt(Number.MIN_SAFE_INTEGER)?Number(n):n;}
  if(value instanceof Double)return value.value;
  if(Buffer.isBuffer(value))return value;
  if(Array.isArray(value))return value.map((v,i)=>decode(v,[...path,String(i)]));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,decode(v,[...path,k])]));
  return value;
 }
 return decode(data,[]);
}
