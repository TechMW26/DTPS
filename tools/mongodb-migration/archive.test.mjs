import test from 'node:test';
import assert from 'node:assert/strict';
import {BSON} from 'mongodb';
import {Timestamp,GeoPoint} from 'firebase-admin/firestore';
import {restValue,restFields,mongoRecord,storageHash,canonical} from './archive.mjs';
import {decodeMongoData} from '../../src/lib/db/mongo-codec.mjs';

test('REST typed fields preserve nested timestamps/nanoseconds, integer64, bytes, refs and geo through BSON',()=>{
 const fields={timestamp:{timestampValue:'2026-10-10T00:00:00.123456789Z'},preEpoch:{timestampValue:'1960-01-01T00:00:00.999999999Z'},integer:{integerValue:'9223372036854775807'},small:{integerValue:'32'},zero:{doubleValue:'-0'},nan:{doubleValue:'NaN'},infinity:{doubleValue:'Infinity'},bytes:{bytesValue:Buffer.from([0,255,1]).toString('base64')},ref:{referenceValue:'projects/project/databases/db/documents/users/123'},geo:{geoPointValue:{latitude:12.2,longitude:72.9}},array:{arrayValue:{values:[{mapValue:{fields:{createdAt:{timestampValue:'0001-01-01T00:00:00.000000001Z'}}}}]}},empty:{arrayValue:{}},null:{nullValue:null}};
 const row=mongoRecord({name:'projects/project/databases/db/documents/users/123/children/child',fields,createTime:'2026-10-10T00:00:00.000000001Z',updateTime:'2026-10-10T01:00:00.999999999Z'},{project:'project',database:'db'},'run');
 assert.equal(row._id,'users/123/children/child');assert.equal(row._collectionPath,'users/123/children');assert.equal(row._parentPath,'users/123');assert.equal(row._collectionGroup,'children');
 const fromBson=BSON.deserialize(BSON.serialize(row),{promoteBuffers:true});assert.equal(storageHash(fromBson.data,fromBson._types),row._storageHash);
 const decoded=decodeMongoData(fromBson.data,fromBson._types);assert(decoded.timestamp instanceof Timestamp);assert.equal(decoded.timestamp.nanoseconds,123456789);assert.equal(decoded.preEpoch.nanoseconds,999999999);assert.equal(decoded.integer,9223372036854775807n);assert(decoded.geo instanceof GeoPoint);assert.equal(decoded.geo.latitude,12.2);assert.deepEqual(decoded.bytes,Buffer.from([0,255,1]));assert.equal(decoded.ref._firestoreReference,fields.ref.referenceValue);assert.equal(decoded.array[0].createdAt.nanoseconds,1);assert(Object.is(decoded.zero,-0));assert(Number.isNaN(decoded.nan));assert.equal(decoded.infinity,Infinity);assert.deepEqual(decoded.empty,[]);
});
test('field maps preserve literal reserved keys and source path identity checks are strict',()=>{
 const fields=JSON.parse('{"__proto__":{"stringValue":"literal"}}');assert.equal(Object.getPrototypeOf(restFields(fields)),null);assert.equal(restFields(fields).__proto__,'literal');
 const row=mongoRecord({name:'projects/project/databases/db/documents/literals/id',fields:{...fields,'dot.key':{stringValue:'dot'},'$key':{stringValue:'dollar'}},createTime:'2026-01-01T00:00:00Z',updateTime:'2026-01-01T00:00:00Z'},{project:'project',database:'db'},'run');const encoded=BSON.deserialize(BSON.serialize(row));assert.equal(Object.prototype.hasOwnProperty.call(encoded.data,'__proto__'),true);assert.equal(encoded.data['dot.key'],'dot');assert.equal(encoded.data.$key,'dollar');
 assert.throws(()=>mongoRecord({name:'projects/other/databases/db/documents/users/id',fields:{},createTime:'2026-01-01T00:00:00Z',updateTime:'2026-01-01T00:00:00Z'},{project:'project',database:'db'},'run'));
 assert.throws(()=>restValue({unknownValue:'bad'}));assert.notDeepEqual(canonical(-0),canonical(0));
});

test('archive exclusion is restricted to the exact unused root banks, preserving media chunks and business fields',async()=>{
 const {excludedMigrationArchive}=await import('./archive.mjs');const source={project:'p',database:'d'},doc=path=>({name:'projects/p/databases/d/documents/'+path});
 assert.equal(excludedMigrationArchive(doc('_migration_originals/id/chunks/0'),source),true);assert.equal(excludedMigrationArchive(doc('_migration_checks/id'),source),true);
 for(const path of ['files/id/chunks/0','medicalReports.chunks/id','receipts.chunks/id','_mediaAssets/id','users/id/_migration_originals/id','_migration_originalsOther/id'])assert.equal(excludedMigrationArchive(doc(path),source),false);
});
test('bounded request pool drains failures and never exceeds its concurrency limit',async()=>{
 const {requestPool}=await import('./batch.mjs');const pool=requestPool(3);let active=0,max=0,done=0;
 for(let i=0;i<10;i++)await pool.add(async()=>{active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,2));active--;done++;});await pool.drain();assert.equal(done,10);assert.equal(max,3);
 const failing=requestPool(1);await assert.rejects(()=>failing.add(()=>Promise.reject(new Error('write rejected'))),/write rejected/);await assert.rejects(()=>failing.drain(),/write rejected/);
});

test('archive checksum validation rejects corruption, truncated gzip and mismatched totals',async()=>{
 const fs=await import('node:fs/promises'),os=await import('node:os'),path=await import('node:path'),zlib=await import('node:zlib');const {archiveDocuments,checkArchive,fileHash}=await import('./archive.mjs');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'dtps-mongo-tool-test-'));try{
  const file=path.join(dir,'records.jsonl.gz');await fs.writeFile(file,zlib.gzipSync('{"name":"a"}\n{"name":"b"}\n'));
  const hash=await fileHash(file),m={documents:2,files:[{file:'records.jsonl.gz',records:2,sha256:hash}]};await checkArchive(dir,m);const records=[];for await(const record of archiveDocuments(file))records.push(record);assert.equal(records.length,2);
  await assert.rejects(()=>checkArchive(dir,{...m,documents:3}),/count mismatch/);await assert.rejects(()=>checkArchive(dir,{...m,files:[{...m.files[0],sha256:'wrong'}]}),/checksum mismatch/);
  const gzip=await fs.readFile(file);await fs.writeFile(file,gzip.subarray(0,gzip.length-10));await assert.rejects(async()=>{for await(const _row of archiveDocuments(file)){}},/unexpected end|unexpected EOF|invalid|checksum/i);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
