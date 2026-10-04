
const REFERENCES = '_nativeExternalFields';
const INLINE_LIMIT = 64 * 1024;

/** Move large scalar payloads to private Storage without changing their bytes or text. */
export async function prepareBlobDocument(source, storeNativeFile, externalFields=[]) {
  if(Object.hasOwn(source,REFERENCES)) throw new Error('Source uses a reserved migration field');
  const fields=[];
  async function visit(value, path) {
    const force=path.length===1 && externalFields.includes(path[0]);
    if((typeof value==='string' && (force || Buffer.byteLength(value)>INLINE_LIMIT || value.startsWith('data:'))) || (Buffer.isBuffer(value) && (force || value.length>INLINE_LIMIT))) {
      const encoding=typeof value==='string'?'utf8':'bytes';
      const file=await storeNativeFile(Buffer.isBuffer(value)?value:Buffer.from(value,'utf8'),'application/octet-stream');
      fields.push({path,encoding,file});
      return null;
    }
    if(Array.isArray(value)) return Promise.all(value.map((item,index)=>visit(item,[...path,String(index)])));
    if(value && typeof value==='object' && (Object.getPrototypeOf(value)===Object.prototype || Object.getPrototypeOf(value)===null)) {
      const output=Object.create(null);
      for(const [key,item] of Object.entries(value)) output[key]=await visit(item,[...path,key]);
      return output;
    }
    return value;
  }
  const data=await visit(source,[]);
  if(fields.length) data[REFERENCES]=fields;
  return data;
}

/** Restore historical API values after authorization, never expose private storage references. */
export async function hydrateBlobDocument(data, readNativeFile) {
  const fields=data[REFERENCES];
  function clone(value) {
    if(Array.isArray(value)) return value.map(clone);
    if(value && typeof value==='object' && (Object.getPrototypeOf(value)===Object.prototype || Object.getPrototypeOf(value)===null)) {
      const out=Object.create(null);
      for(const [key,item] of Object.entries(value)) out[key]=clone(item);
      return out;
    }
    return value;
  }
  const result=clone(data);
  delete result[REFERENCES];
  for(const field of fields||[]) {
    if(!Array.isArray(field.path) || !field.path.length || !['utf8','bytes'].includes(field.encoding)) throw new Error('Invalid external field mapping');
    let parent=result;
    for(const part of field.path.slice(0,-1)) {
      if(!parent || !Object.hasOwn(parent,part)) throw new Error('Missing external field path');
      parent=parent[part];
    }
    const key=field.path.at(-1);
    if(!parent || !Object.hasOwn(parent,key) || parent[key]!==null) throw new Error('External field placeholder mismatch');
    const bytes=await readNativeFile(field.file);
    parent[key]=field.encoding==='utf8'?bytes.toString('utf8'):bytes;
  }
  return result;
}
