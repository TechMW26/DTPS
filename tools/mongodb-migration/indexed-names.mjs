// Explicit opt-in only after an existing or authorized name index is READY.
// The first execution plan must prove bounded scanning; never repeat an unindexed full-bank page.
import fs from 'node:fs';
import path from 'node:path';
import {save,sha256} from './archive.mjs';
export function proveNameSeek(stats,returned){
 const scanned=Number(stats.match(/index row scanned:\s*([\d,]+)/)?.[1]?.replaceAll(',',''));
 if(!Number.isFinite(scanned)||scanned>returned*1.25+500||stats.includes('MajorSort'))throw new Error('Name pagination has not proved bounded indexed scanning');
 return {returned,scanned,stats};
}
export async function indexedNames(source,group,expected,dir){
 const indexes=await source.control('collectionGroups/'+encodeURIComponent(group)+'/indexes');
 const ready=(indexes.indexes||[]).find(i=>i.name.includes('/collectionGroups/'+group+'/')&&i.state==='READY'&&i.fields?.length===1&&i.fields[0].fieldPath==='__name__'&&i.fields[0].order==='ASCENDING');
 if(!ready)throw new Error('Explicit name enumeration requires a READY collection-group name index');
 const names=[],seen=new Set(),prefix=sha256(group).slice(0,20)+'-name-page-';let cursor=null,page=0;
 while(names.length<expected){
  const file=path.join(dir,prefix+String(page++).padStart(5,'0')+'.json');let record;
  if(fs.existsSync(file)){record=JSON.parse(fs.readFileSync(file));if(record.readTime!==source.readTime||record.cursor!==cursor||record.sha256!==sha256(JSON.stringify(record.names)))throw new Error('Name-page checkpoint mismatch');}
  else{const P=source.Pipelines;let q=source.db.pipeline().collectionGroup({collectionId:group,forceIndex:ready.name.split('/').at(-1)});if(cursor)q=q.where(P.field('__name__').greaterThan(source.db.doc(cursor)));q=q.sort(P.field('__name__').ascending()).limit(Math.min(5000,expected-names.length)).select('__name__');
   const result=await q._execute(source.timestamp,page===1?{explainOptions:{mode:'analyze',outputFormat:'text'}}:{}),values=(result.result||result.results||[]).map(r=>r.ref?.path);if(!values.length)throw new Error('Indexed name pagination ended early');
   const proof=page===1?proveNameSeek(result.explainStats?.text||'',values.length):undefined;
   record={readTime:source.readTime,cursor,names:values,sha256:sha256(JSON.stringify(values)),...(proof?{proof,index:ready.name}:{})};save(file,record);
  }
  if(page===1){if(!record.proof)throw new Error('Initial name-page proof is missing');proveNameSeek(record.proof.stats,record.names.length);}
  for(const name of record.names){if(!name||name.split('/').at(-2)!==group||seen.has(name))throw new Error('Indexed names contain invalid or overlapping identities');seen.add(name);names.push(name);}cursor=record.names.at(-1);
  console.log(JSON.stringify({indexedNamePage:true,group,documents:record.names.length,total:names.length,expected}));
 }
 if(names.length!==expected)throw new Error('Indexed name total differs from fixed snapshot');return names;
}
