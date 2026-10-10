import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import {createGunzip} from 'node:zlib';
import {createHash} from 'node:crypto';
import {Timestamp,GeoPoint} from 'firebase-admin/firestore';
import {encodeMongoData} from '../../src/lib/db/mongo-codec.mjs';

export const sha256=value=>createHash('sha256').update(value).digest('hex');
export function canonical(value){
 if(value===null)return ['null'];
 if(value instanceof Date)return ['date',value.toISOString()];
 if(Buffer.isBuffer(value)||value instanceof Uint8Array)return ['bytes',Buffer.from(value).toString('base64')];
 if(value?._bsontype==='Binary')return ['bytes',Buffer.from(value.value()).toString('base64')];
 if(typeof value==='bigint'||value?._bsontype==='Long')return ['integer64',String(value)];
 if(value?._bsontype==='Int32'||value?._bsontype==='Double')return canonical(value.valueOf());
 if(Array.isArray(value))return ['array',value.map(canonical)];
 if(typeof value==='object')return ['map',Object.keys(value).sort().map(key=>[key,canonical(value[key])])];
 if(typeof value==='number')return ['number',Object.is(value,-0)?'-0':Number.isFinite(value)?value:String(value)];
 return [typeof value,value];
}
export const storageHash=(data,types)=>sha256(JSON.stringify(canonical({data,types})));
export function restValue(value){
 if(Object.hasOwn(value,'nullValue'))return null;
 if(Object.hasOwn(value,'stringValue'))return value.stringValue;
 if(Object.hasOwn(value,'booleanValue'))return value.booleanValue;
 if(Object.hasOwn(value,'integerValue')){const big=BigInt(value.integerValue);return big<=BigInt(Number.MAX_SAFE_INTEGER)&&big>=BigInt(Number.MIN_SAFE_INTEGER)?Number(big):big;}
 if(Object.hasOwn(value,'doubleValue'))return typeof value.doubleValue==='number'?value.doubleValue:Number(value.doubleValue);
 if(Object.hasOwn(value,'timestampValue')){
  const stamp=value.timestampValue,parsed=Date.parse(stamp);if(!Number.isFinite(parsed))throw new Error('Invalid Firestore timestamp');
  const nanos=Number((stamp.match(/\.(\d+)Z$/)?.[1]||'').padEnd(9,'0'));
  return new Timestamp(Math.floor(parsed/1000),nanos);
 }
 if(Object.hasOwn(value,'bytesValue'))return Buffer.from(value.bytesValue,'base64');
 if(Object.hasOwn(value,'referenceValue'))return {_firestoreReference:value.referenceValue};
 if(Object.hasOwn(value,'geoPointValue'))return new GeoPoint(value.geoPointValue.latitude,value.geoPointValue.longitude);
 if(Object.hasOwn(value,'arrayValue'))return (value.arrayValue.values||[]).map(restValue);
 if(Object.hasOwn(value,'mapValue'))return restFields(value.mapValue.fields||{});
 throw new Error('Unsupported Firestore value type');
}
export function restFields(fields){const result=Object.create(null);for(const [key,value] of Object.entries(fields))Object.defineProperty(result,key,{value:restValue(value),enumerable:true,writable:true,configurable:true});return result;}
export function mongoRecord(doc,source,run){
 const prefix=`projects/${source.project}/databases/${source.database}/documents/`;
 if(!doc.name?.startsWith(prefix)||!doc.createTime||!doc.updateTime)throw new Error('Archive identity or timestamps invalid');
 const id=doc.name.slice(prefix.length),parts=id.split('/');if(parts.length%2||parts.some(x=>!x))throw new Error('Invalid document path');
 const {data,types}=encodeMongoData(restFields(doc.fields||{}));const create=restValue({timestampValue:doc.createTime}),update=restValue({timestampValue:doc.updateTime});
 return {_id:id,_collectionPath:parts.slice(0,-1).join('/'),_parentPath:parts.slice(0,-2).join('/'),_collectionGroup:parts.at(-2),data,_types:types,
  _createTime:new Date(doc.createTime),_updateTime:new Date(doc.updateTime),_createTimestamp:{seconds:create.seconds,nanos:create.nanoseconds},_updateTimestamp:{seconds:update.seconds,nanos:update.nanoseconds},_sourceCreateTime:doc.createTime,_sourceUpdateTime:doc.updateTime,
  _sourceHash:sha256(JSON.stringify(canonical(doc))),_storageHash:storageHash(data,types),_migrationSource:`${source.project}/${source.database}`,_migrationRun:run};
}
export async function fileHash(file){const hash=createHash('sha256');for await(const bytes of fs.createReadStream(file))hash.update(bytes);return hash.digest('hex');}
export async function* archiveDocuments(file){
 const input=fs.createReadStream(file),gzip=createGunzip(),stream=input.pipe(gzip),lines=readline.createInterface({input:stream,crlfDelay:Infinity});
 input.on('error',error=>gzip.destroy(error));
 try{for await(const line of lines)if(line)yield JSON.parse(line);}finally{lines.close();input.destroy();gzip.destroy();}
}
export function save(file,value){fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});const temp=file+'.tmp';const fd=fs.openSync(temp,'w',0o600);try{fs.writeFileSync(fd,JSON.stringify(value,null,2));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(temp,file);}
export function arg(name,fallback){const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];}
export function manifestAt(dir){const m=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'));if(!m.complete||!m.project||!m.database||!m.readTime||!m.files?.length)throw new Error('A complete verified Firestore archive is required');return m;}
export async function checkArchive(dir,manifest){let total=0;for(const file of manifest.files){const filename=path.join(dir,file.file);if(!/^[a-zA-Z0-9_.-]+$/.test(file.file)||await fileHash(filename)!==file.sha256)throw new Error('Archive checksum mismatch');total+=file.records;}if(total!==manifest.documents)throw new Error('Archive manifest count mismatch');}

/** Archive-only banks are retained in the local source dump, never required by application media hydration. */
export const ARCHIVE_ROOTS=['_migration_originals','_migration_checks','_nativeMigrationJournal','_nativeMigrationJournalCounters'];
export const excludedArchivePath=path=>ARCHIVE_ROOTS.includes(path.split('/')[0]);
export function excludedMigrationArchive(doc,source){
 const prefix=`projects/${source.project}/databases/${source.database}/documents/`;
 if(!doc.name?.startsWith(prefix))throw new Error('Source identity mismatch');
 const root=doc.name.slice(prefix.length).split('/')[0];
 return ARCHIVE_ROOTS.includes(root);
}
