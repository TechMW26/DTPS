// Writer-independent consistent final snapshot: all IDs/system timestamps scanned, only changed bodies read.
// Run only after all source writers are gated, or this captures a point in time rather than a final cutover.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {sourceConnection} from './source.mjs';
import {archiveLock} from './archive-lock.mjs';
import {bootstrapBaseline} from './bootstrap.mjs';
import {indexedNames} from './indexed-names.mjs';
import {streamNames} from './inventory-stream.mjs';
import {partitionedNames,LEADING} from './partitioned-inventory.mjs';
import {sqliteIndex} from './sqlite.mjs';
import {arg,manifestAt,checkArchive,fileHash,save} from './archive.mjs';
const baseline=path.resolve(arg('--baseline','')),output=path.resolve(arg('--output',''));if(!arg('--baseline')||!arg('--output')||baseline===output)throw new Error('Separate --baseline and --output folders required');
const bootstrapIncomplete=process.argv.includes('--bootstrap-incomplete'),base=await bootstrapBaseline(baseline,bootstrapIncomplete);
if(bootstrapIncomplete&&(base.files.length!==98||base.groups.length!==99||base.bootstrapMissingGroups.join(',')!=='notificationdeliveryaudits'))throw new Error('Authorized DTPS bootstrap requires exactly the 98 complete shards and sole missing audit bank');
fs.mkdirSync(output,{recursive:true,mode:0o700});
const unlock=archiveLock(output,'capture');process.once('exit',unlock);
const index=arg('--index',path.join(output,'baseline.sqlite')),overlay=arg('--overlay-index'),manifestFile=path.join(output,'manifest.json');
if(overlay&&!fs.existsSync(index))throw new Error('Immutable overlay requires an existing verified baseline index');
if(!fs.existsSync(index))execFileSync('python3',[path.resolve('tools/mongodb-migration/baseline-index.py'),'build',baseline,index,...(bootstrapIncomplete?['--allow-incomplete']:[])],{stdio:['ignore','ignore','inherit']});
let manifest=fs.existsSync(manifestFile)?JSON.parse(fs.readFileSync(manifestFile)):null;if(manifest?.complete){console.log(JSON.stringify({alreadyComplete:true,documents:manifest.documents}));process.exit(0);}
const finalCutover=process.argv.includes('--final-cutover'),gateTime=arg('--write-gate-time');
if(bootstrapIncomplete&&finalCutover)throw new Error('Partial bootstrap creates a new initial snapshot, never a final cutover');
if(finalCutover&&(!process.argv.includes('--writers-gated')||!gateTime||!Number.isFinite(Date.parse(gateTime))))throw new Error('Final capture requires --writers-gated and exact --write-gate-time after every writer has drained');
// PITR snapshots older than an hour need whole minutes. A floor minute after gating would lose recent writes.
const defaultTime=finalCutover?Math.ceil(Math.max(Date.now(),Date.parse(gateTime))/60000)*60000:Math.floor(Date.now()/60000)*60000;
const readTime=manifest?.readTime||arg('--read-time',new Date(defaultTime).toISOString());
if(finalCutover&&Date.parse(readTime)<Date.parse(gateTime))throw new Error('Final snapshot precedes the completed write gate');
if(bootstrapIncomplete&&Date.parse(readTime)<=Date.parse(base.readTime))throw new Error('Coherent refresh requires one later fixed snapshot time');
const wait=Date.parse(readTime)-Date.now()+1000;if(wait>61000)throw new Error('Snapshot is too far in the future');if(wait>0)await new Promise(resolve=>setTimeout(resolve,wait));
console.log(JSON.stringify({captureStarting:true,readTime,bootstrapIncomplete,baselineDocuments:base.documents}));
const source=sourceConnection(readTime),local=sqliteIndex(index,{overlay,output});
try{
 if(source.project!==base.project||source.database!==base.database)throw new Error('Baseline and current source differ');
 const ready=await local.call('begin',{readTime});if(Boolean(ready.baseline.partialSource)!==bootstrapIncomplete)throw new Error('Baseline index partial/full scope differs');if(ready.baseline.readTime!==base.readTime||ready.baseline.project!==base.project||ready.baseline.database!==base.database||JSON.stringify(ready.baseline.files)!==JSON.stringify(base.files))throw new Error('Local baseline snapshot mismatch');
 if(!manifest){const inventory=await source.snapshot(source.db.pipeline().database().aggregate({accumulators:[source.Pipelines.countAll().as('total')],groups:[source.Pipelines.field('__name__').collectionId().as('collection')]}));const groups=inventory.results.map(row=>row.data()).sort((a,b)=>a.collection.localeCompare(b.collection));
  const count=await source.snapshot(source.db.pipeline().database().aggregate(source.Pipelines.countAll().as('total'))),expected=count.results[0].get('total');if(groups.reduce((n,g)=>n+g.total,0)!==expected)throw new Error('Source inventory count mismatch');
  manifest={format:'Firestore REST typed documents, gzip JSONL',project:source.project,database:source.database,readTime,baselineReadTime:base.readTime,bootstrapIncomplete,bootstrapMissingGroups:base.bootstrapMissingGroups||[],finalCutover,immutableBaselineOverlay:Boolean(overlay),writeGateTime:gateTime||null,baselineArchive:baseline,baselineFiles:base.files.map(f=>({file:f.file,sha256:f.sha256,records:f.records})),startedAt:new Date().toISOString(),complete:false,expectedDocuments:expected,groups,completedGroups:[],files:[],metadataChecked:0,bodiesFetched:0};save(manifestFile,manifest);
 }
 for(const group of manifest.groups){if(manifest.completedGroups.includes(group.collection))continue;
  const paths=(arg('--indexed-name-groups','').split(',').includes(group.collection))?await indexedNames(source,group.collection,group.total,output):LEADING[group.collection]?await partitionedNames(source,group.collection,group.total,output):await streamNames(source.stream(source.db.pipeline().collectionGroup(group.collection).select('__name__')),group.collection,group.total);let names=paths.map(id=>`projects/${source.project}/databases/${source.database}/documents/${id}`);if(names.length!==group.total||new Set(names).size!==names.length)throw new Error('Group inventory mismatch');
  let cursor=0,checked=0,fetched=0;
  if(overlay){const done=await local.call('group_progress',{group:group.collection,readTime}),seen=new Set(done.paths),expectedPaths=new Set(paths);if(seen.size!==done.paths.length||done.paths.some(p=>!expectedPaths.has(p)))throw new Error('Resumed overlay identity differs from fixed inventory');checked=seen.size;fetched=done.changed;names=names.filter((_name,i)=>!seen.has(paths[i]));}
  await Promise.all(Array.from({length:8},async()=>{for(;;){const at=cursor;if(at>=names.length)break;cursor+=300;const expected=new Set(names.slice(at,at+300));const batch=await source.rest('batchGet',{documents:names.slice(at,at+300),readTime,mask:{fieldPaths:[]}}),docs=batch.map(row=>{const doc=row.found;if(!doc?.name||!expected.delete(doc.name)||!doc.createTime||!doc.updateTime||Object.keys(doc.fields||{}).length)throw new Error('System metadata projection failed');return doc;});if(expected.size||docs.length!==Math.min(300,names.length-at))throw new Error('Source metadata batch incomplete');
   const changes=await local.call('check',{documents:docs});checked+=docs.length;
   for(let i=0;i<changes.changed.length;i+=40){const part=changes.changed.slice(i,i+40),wanted=new Set(part),full=await source.rest('batchGet',{documents:part,readTime}),current=full.map(row=>{if(!row.found||!wanted.delete(row.found.name))throw new Error('Changed document missing or duplicated');return row.found;});if(wanted.size||current.length!==part.length)throw new Error('Changed body batch incomplete');await local.call('apply',{documents:current});fetched+=current.length;}
  }}));
  if(checked!==group.total)throw new Error('Group metadata incomplete');manifest.completedGroups.push(group.collection);manifest.metadataChecked+=checked;manifest.bodiesFetched+=fetched;save(manifestFile,manifest);console.log(JSON.stringify({group:group.collection,metadata:checked,bodiesFetched:fetched,total:manifest.metadataChecked,expected:manifest.expectedDocuments}));
 }
 if(manifest.completedGroups.length!==manifest.groups.length||new Set(manifest.completedGroups).size!==manifest.groups.length||manifest.metadataChecked!==manifest.expectedDocuments)throw new Error('Complete current source metadata inventory is required');
 const merged=await local.call('finish',{output,expected:manifest.expectedDocuments});
 if(JSON.stringify(merged.groups.map(g=>[g.collection,g.total]).sort())!==JSON.stringify(manifest.groups.map(g=>[g.collection,g.total]).sort()))throw new Error('Reconstructed group counts differ from current source inventory');
 const names=['documents.jsonl.gz','changed.jsonl.gz','deleted.jsonl.gz','metadata.jsonl.gz'],files=[];
 for(const name of names)files.push({file:name,bytes:fs.statSync(path.join(output,name)).size,sha256:await fileHash(path.join(output,name)),records:name==='changed.jsonl.gz'?merged.changed:name==='deleted.jsonl.gz'?merged.deleted:merged.documents});
 Object.assign(manifest,{documents:merged.documents,collections:merged.collections,groups:merged.groups,files:[files[0]],deltaFiles:files.slice(1),changedDocuments:merged.changed,deletedDocuments:merged.deleted,complete:true,completedAt:new Date().toISOString()});save(manifestFile,manifest);console.log(JSON.stringify({complete:true,documents:manifest.documents,changed:merged.changed,deleted:merged.deleted,readTime}));
}finally{await local.close().catch(()=>local.kill());await source.close();}
