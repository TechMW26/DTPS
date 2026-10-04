import {createHash} from 'node:crypto';
const hash=value=>createHash('sha256').update(value).digest('hex');

// BSON ObjectIds retain existing URLs. Other ID types use disjoint namespaces.
export function nativeDocumentId(id, identity) {
  if(id?._bsontype==='ObjectId')return id.toHexString();
  if(typeof id==='string') {
    const encoded='string-'+Buffer.from(id).toString('base64url');
    return Buffer.byteLength(encoded)<=1400?encoded:'string-hash-'+hash(id);
  }
  return 'typed-'+hash(identity);
}

// Compare native server values including Timestamp and Bytes without losing types.
export function nativeDigest(value) {
  function canonical(v) {
    if(v===null)return ['null'];
    if(v instanceof Date)return ['date',v.toISOString()];
    if(v && typeof v.toDate==='function')return ['date',v.toDate().toISOString()];
    if(Buffer.isBuffer(v) || v instanceof Uint8Array)return ['bytes',Buffer.from(v).toString('base64')];
    if(Array.isArray(v))return ['array',v.map(canonical)];
    if(typeof v==='object')return ['object',Object.keys(v).sort().map(k=>[k,canonical(v[k])])];
    if(typeof v==='number')return ['number',Number.isNaN(v)?'NaN':!Number.isFinite(v)?String(v):v===0?0:v];
    return [typeof v,v];
  }
  return hash(JSON.stringify(canonical(value)));
}
