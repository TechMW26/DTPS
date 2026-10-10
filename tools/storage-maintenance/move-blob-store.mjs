// Explicit user-requested relocation. Deletion is a separate verified final step.
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import {list,head,put} from '@vercel/blob';
import {createPrivateBlobArchive} from '../../src/lib/storage/private-blob.mjs';
const evidenceDirectory=process.argv.find(argument=>argument.startsWith('--evidence-directory='))?.slice('--evidence-directory='.length);
if(!evidenceDirectory || !path.isAbsolute(evidenceDirectory))throw new Error('An absolute private --evidence-directory is required');
const dir=path.resolve(evidenceDirectory);
if(!process.argv.includes('--execute') || process.env.VERCEL)throw new Error('Local explicit relocation required');
const source=dotenv.parse(fs.readFileSync(path.join(dir,'blob-config.env')));
const target=dotenv.parse(fs.readFileSync(path.join(dir,'existing-blob-config.env')));
if(source.MIGRATION_BLOB_STORE_ID!=='store_nVuKTNSRSPpMIkoV' || target.MIGRATION_BLOB_STORE_ID!=='store_S1BRON8GWQ2akpN0')throw new Error('Unexpected relocation endpoints');
const archive=e=>createPrivateBlobArchive({storeId:e.MIGRATION_BLOB_STORE_ID,token:e.MIGRATION_BLOB_READ_WRITE_TOKEN});
const from=archive(source),to=archive(target);
const checkpoint=path.join(dir,'blob-relocation.json');
const state=fs.existsSync(checkpoint)?JSON.parse(fs.readFileSync(checkpoint)):{source:source.MIGRATION_BLOB_STORE_ID,target:target.MIGRATION_BLOB_STORE_ID,objects:{},complete:false};
if(state.source!==source.MIGRATION_BLOB_STORE_ID || state.target!==target.MIGRATION_BLOB_STORE_ID)throw new Error('Relocation checkpoint mismatch');
const save=()=>{fs.writeFileSync(checkpoint+'.tmp',JSON.stringify(state),{mode:0o600});fs.renameSync(checkpoint+'.tmp',checkpoint);};
const inventory=[];let cursor;
do {const page=await list({token:source.MIGRATION_BLOB_READ_WRITE_TOKEN,limit:1000,...(cursor?{cursor}:{})});inventory.push(...page.blobs);cursor=page.hasMore?page.cursor:undefined;}while(cursor);
fs.writeFileSync(path.join(dir,'blob-relocation-inventory.json'),JSON.stringify(inventory),{mode:0o600});
console.log(JSON.stringify({objects:inventory.length,bytes:inventory.reduce((n,b)=>n+b.size,0)}));
let next=0;
const outcomes=await Promise.allSettled(Array.from({length:32},async()=>{
 while(next<inventory.length){const item=inventory[next++];
  if(state.objects[item.pathname]?.contentTypePreserved)continue;
  const metadata=await head(item.pathname,{token:source.MIGRATION_BLOB_READ_WRITE_TOKEN});
  const match=item.pathname.match(/^dtps-native-staging\/originals\/([a-f0-9]{64})$/);if(!match)throw new Error('Unknown source object: must review before deletion');
  const ref={provider:'vercel-blob',storeId:state.source,pathname:item.pathname,url:new URL(item.url).href,sha256:match[1],size:item.size,contentType:metadata.contentType};
  const bytes=await from.read(ref);
  if(state.objects[item.pathname]) {
    // Repair MIME metadata only for copies this relocation already created.
    await put(item.pathname,bytes,{token:target.MIGRATION_BLOB_READ_WRITE_TOKEN,access:'private',addRandomSuffix:false,allowOverwrite:true,contentType:ref.contentType,multipart:bytes.length>5*1024*1024});
  }
  const copied=await to.store(bytes,ref.contentType);
  let targetMetadata=await head(item.pathname,{token:target.MIGRATION_BLOB_READ_WRITE_TOKEN});
  if(targetMetadata.contentType!==metadata.contentType) {
    // A previous interrupted attempt may have stored bytes before its checkpoint.
    // store() above has verified identical bytes before this metadata repair.
    await put(item.pathname,bytes,{token:target.MIGRATION_BLOB_READ_WRITE_TOKEN,access:'private',addRandomSuffix:false,allowOverwrite:true,contentType:ref.contentType,multipart:bytes.length>5*1024*1024});
    await to.read(copied);
    targetMetadata=await head(item.pathname,{token:target.MIGRATION_BLOB_READ_WRITE_TOKEN});
    if(targetMetadata.contentType!==metadata.contentType)throw new Error('Relocation MIME metadata mismatch');
  }
  if(copied.sha256!==ref.sha256 || copied.size!==ref.size)throw new Error('Relocation checksum mismatch');
  state.objects[item.pathname]={...copied,contentTypePreserved:true};save();
  if(Object.keys(state.objects).length%100===0)console.log(JSON.stringify({copied:Object.keys(state.objects).length,total:inventory.length}));
 }
}));
const errors=outcomes.filter(o=>o.status==='rejected');if(errors.length)throw errors[0].reason;
state.complete=inventory.every(item=>state.objects[item.pathname]?.size===item.size);state.verifiedAt=new Date().toISOString();save();
console.log(JSON.stringify({copied:Object.keys(state.objects).length,complete:state.complete,sourceRetained:true}));
