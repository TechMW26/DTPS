import { createHash } from 'node:crypto';

export const ARCHIVE_CHUNK_BYTES = 512 * 1024;
export const sha256 = value => createHash('sha256').update(value).digest('hex');

/** BSON is confined to the one-time source reader, never required by the native app. */
export function nativeRecord(source, { invalidDates = 'quarantine' } = {}) {
  const exceptions = [], corrections = [];
  function convert(value, path = []) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') return value;
    if (value instanceof Date) {
      if (!Number.isFinite(value.getTime()) || value.getUTCFullYear() < 1 || value.getUTCFullYear() > 9999) {
        const issue = { path, reason: 'unsupported-date' };
        if (invalidDates === 'flag') corrections.push({...issue, originalMilliseconds: String(value.getTime()), originalISO: Number.isFinite(value.getTime()) ? value.toISOString() : null, status: 'needs-staff-correction'});
        else exceptions.push(issue);
        return null;
      }
      return value;
    }
    if (Buffer.isBuffer(value)) return value;
    if (value?._bsontype) {
      switch (value._bsontype) {
        case 'ObjectId': return value.toHexString();
        case 'Int32': case 'Double': return value.valueOf();
        case 'Binary':
          if (value.sub_type === 0) return Buffer.from(value.value());
          break;
        // Never round financial decimals or 64-bit integers into JS numbers.
        case 'Long': {
          const bigint = value.toBigInt();
          if (bigint >= BigInt(Number.MIN_SAFE_INTEGER) && bigint <= BigInt(Number.MAX_SAFE_INTEGER)) return Number(bigint);
          break;
        }
      }
      exceptions.push({ path, reason: `unsupported-bson-${value._bsontype}` });
      return null;
    }
    if (Array.isArray(value)) {
      return value.map((item, i) => {
        if (Array.isArray(item)) exceptions.push({ path: [...path, String(i)], reason: 'nested-array' });
        return convert(item, [...path, String(i)]);
      });
    }
    if (value && typeof value === 'object') {
      const result = Object.create(null);
      for (const [key, item] of Object.entries(value)) {
        if (/^__.*__$/.test(key) || Buffer.byteLength(key) > 1500) exceptions.push({ path: [...path, key], reason: 'unsupported-field-name' });
        result[key] = convert(item, [...path, key]);
      }
      if (path.length >= 20) exceptions.push({ path, reason: 'document-depth' });
      return result;
    }
    exceptions.push({ path, reason: 'unsupported-value' });
    return null;
  }
  const data = convert(source);
  if (corrections.length) {
    if (Object.hasOwn(data, '_nativeMigrationIssues')) exceptions.push({path:['_nativeMigrationIssues'], reason:'reserved-migration-field'});
    else data._nativeMigrationIssues = corrections;
  }
  // Only the user-approved invalid-date mapping may produce a flagged partial value.
  return { data: exceptions.length ? null : data, exceptions };
}

/** Lossless originals are chunked below Firestore's 1 MiB document limit. */
export function archiveParts(raw) {
  const bytes = Buffer.from(raw);
  const chunks = [];
  for (let start = 0; start < bytes.length; start += ARCHIVE_CHUNK_BYTES) {
    chunks.push(bytes.subarray(start, start + ARCHIVE_CHUNK_BYTES));
  }
  return { hash: sha256(bytes), byteLength: bytes.length, chunks };
}

export function verifyArchive(manifest, chunks) {
  if (chunks.length !== manifest.chunkCount) throw new Error('Archive chunk count mismatch');
  const bytes = Buffer.concat(chunks.map(chunk => Buffer.from(chunk)));
  if (bytes.length !== manifest.byteLength || sha256(bytes) !== manifest.hash) throw new Error('Archive checksum mismatch');
  return bytes;
}
