// Read-only source journal consumption. No Mongo connection or business writes.
import fs from 'node:fs';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import {once} from 'node:events';
import {arg,manifestAt,checkArchive,fileHash,sha256,save,archiveDocuments,restFields,canonical} from './archive.mjs';
import {sourceConnection} from './source.mjs';
import {archiveLock} from './archive-lock.mjs';
import {sqliteIndex} from './sqlite.mjs';
import {journalPlan,journalBatch,journalEvent,counterVector,pathStates,eventId,counterId,resource,timeNs,SHARDS,JOURNAL,COUNTERS} from './journal-guard.mjs';
const activationFile=arg('--activation-proof'),endFile=arg('--end-vector'),baselineDir=arg('--baseline'),outputArg=arg('--output');
if(!activationFile||!endFile||!baselineDir||!outputArg)throw new Error('--activation-proof, --end-vector, --baseline and --output required');
const activation=JSON.parse(fs.readFileSync(activationFile)),end=JSON.parse(fs.readFileSync(endFile)),baseline=manifestAt(baselineDir),plan=journalPlan(activation,baseline,end,Number(arg('--max-events','1000000'))),output=path.resolve(outputArg);
if(output===path.resolve(baselineDir))throw new Error('Separate journal output required');
await checkArchive(baselineDir,baseline);
if(!process.argv.includes('--capture')){console.log(JSON.stringify({capture:false,readonly:true,final:plan.final,source:`${plan.source.project}/${plan.source.database}`,readTime:plan.readTime,events:plan.events,shards:SHARDS}));process.exit(0);}
fs.mkdirSync(output,{recursive:true,mode:0o700});const unlock=archiveLock(output,'journal');process.once('exit',unlock);
function guard(){const disk=fs.statfsSync(output);if(disk.bavail*disk.bsize<3*1024**3)throw new Error('Journal capture paused: less than 3GiB free');let extra=0;for(const file of fs.readdirSync(output)){const stat=fs.statSync(path.join(output,file));if(stat.isFile())extra+=stat.size;}if(extra>2*1024**3)throw new Error('Journal capture paused: extra disk budget exceeded');}
guard();
const manifestFile=path.join(output,'journal-manifest.json'),identity={source:plan.source,epoch:plan.epoch,activationSha256:await fileHash(activationFile),endSha256:await fileHash(endFile),baselineManifestSha256:await fileHash(path.join(baselineDir,'manifest.json')),baselineReadTime:baseline.readTime,baselineFiles:baseline.files,readTime:plan.readTime,vectorStart:activation.vector,vectorEnd:end.vector,final:plan.final,writeGateTime:plan.writeGateTime};
let manifest=fs.existsSync(manifestFile)?JSON.parse(fs.readFileSync(manifestFile)):null;
if(manifest&&JSON.stringify(manifest.identity)!==JSON.stringify(identity))throw new Error('Journal output belongs to another baseline or sequence fence');
if(!manifest){manifest={format:'DTPS journal typed delta v1',identity,complete:false,startedAt:new Date().toISOString(),expectedEvents:plan.events,eventChunks:[],stateChunks:[]};save(manifestFile,manifest);}
if(manifest.complete){const {journalArchive}=await import('./journal-target-guard.mjs');await journalArchive(output,activationFile,endFile);console.log(JSON.stringify({alreadyComplete:true,readonly:true,final:plan.final,events:manifest.events,paths:manifest.paths}));process.exit(0);}
const source=sourceConnection(plan.readTime),local=sqliteIndex(path.join(output,'paths.sqlite'),{journal:true});
async function savedDocs(entry){if(!/^[A-Za-z0-9_.-]+$/.test(entry.file)||await fileHash(path.join(output,entry.file))!==entry.sha256)throw new Error('Journal checkpoint checksum mismatch');const rows=[];for await(const row of archiveDocuments(path.join(output,entry.file)))rows.push(row);if(rows.length!==entry.records)throw new Error('Journal checkpoint count mismatch');return rows;}
function saveDocs(file,rows){fs.writeFileSync(path.join(output,file),gzipSync(rows.map(row=>JSON.stringify(row)).join('\n')+(rows.length?'\n':'')),{mode:0o600});return {file,records:rows.length,sha256:sha256(fs.readFileSync(path.join(output,file)))};}
async function combine(file,entries){const out=fs.createWriteStream(path.join(output,file),{mode:0o600});try{for(const entry of entries){for await(const bytes of fs.createReadStream(path.join(output,entry.file)))if(!out.write(bytes))await once(out,'drain');guard();}if(!entries.length)out.write(gzipSync(''));out.end();await once(out,'finish');}catch(error){out.destroy();throw error;}return {file,records:entries.reduce((n,e)=>n+e.records,0),bytes:fs.statSync(path.join(output,file)).size,sha256:await fileHash(path.join(output,file))};}
try{
 if(source.project!==plan.source.project||source.database!==plan.source.database)throw new Error('Journal source credentials belong to another database');
 await local.call('begin',{identity});
 let endCounters;manifest.counters={};
 for(const [proof,initial] of [[activation,true],[end,false]]){const names=Array.from({length:SHARDS},(_,s)=>resource(plan.source,`${COUNTERS}/${counterId(plan.epoch,s)}`)),rows=await source.rest('batchGet',{documents:names,readTime:proof.readTime});counterVector(rows,proof,initial||Boolean(end.missingCounterShards?.length));manifest.counters[initial?'start':'end']=saveDocs(initial?'counters-start.jsonl.gz':'counters-end.jsonl.gz',rows);save(manifestFile,manifest);if(!initial)endCounters=new Map(rows.filter(row=>row.found).map(row=>[restFields(row.found.fields).shard,row.found]));}
 let events=0;
 for(const range of plan.ranges){for(let start=range.start+1;start<=range.stop;start+=300){guard();const stop=Math.min(range.stop,start+299),file=`events-${String(range.shard).padStart(2,'0')}-${String(start).padStart(16,'0')}.jsonl.gz`,existing=manifest.eventChunks.find(e=>e.file===file);let docs;
   if(existing){if(existing.shard!==range.shard||existing.start!==start||existing.stop!==stop)throw new Error('Resumed journal range differs');docs=journalBatch((await savedDocs(existing)).map(found=>({found})),plan,range.shard,start,stop);}
   else{const names=Array.from({length:stop-start+1},(_,i)=>resource(plan.source,`${JOURNAL}/${eventId(plan.epoch,range.shard,start+i)}`));docs=journalBatch(await source.rest('batchGet',{documents:names,readTime:plan.readTime}),plan,range.shard,start,stop);}
   if(stop===range.stop&&timeNs(docs.at(-1).createTime)!==timeNs(endCounters.get(range.shard).updateTime))throw new Error('Latest journal commit and counter atomic version differ');
   await local.call('events',{events:docs.map(doc=>{const fields=restFields(doc.fields);return {shard:range.shard,seq:fields.seq,hash:sha256(JSON.stringify(canonical(doc))),paths:journalEvent(doc,plan,range.shard,fields.seq)};})});
   if(!existing){manifest.eventChunks.push({...saveDocs(file,docs),shard:range.shard,start,stop});save(manifestFile,manifest);}events+=docs.length;
  }console.log(JSON.stringify({journalShard:range.shard,events,expected:plan.events}));}
 const counts=await local.call('counts');if(events!==plan.events||counts.events!==plan.events||manifest.eventChunks.reduce((n,e)=>n+e.records,0)!==plan.events)throw new Error('Contiguous vector coverage incomplete');
 let after='',pages=0,checked=0;
 for(;;){guard();const {paths}=await local.call('paths',{after,limit:40});if(!paths.length)break;const pathsHash=sha256(JSON.stringify(paths)),existing=manifest.stateChunks[pages],stem=`states-${String(pages).padStart(8,'0')}`;let states;
  if(existing){if(existing.pathsSha256!==pathsHash)throw new Error('Resumed path inventory differs');states={changed:await savedDocs(existing.changed),deleted:await savedDocs(existing.deleted)};pathStates([...states.changed.map(found=>({found})),...states.deleted.map(row=>({missing:resource(plan.source,row.path)}))],plan.source,paths,plan.readTime);}
  else{states=pathStates(await source.rest('batchGet',{documents:paths.map(p=>resource(plan.source,p)),readTime:plan.readTime}),plan.source,paths,plan.readTime);manifest.stateChunks.push({pathsSha256:pathsHash,changed:saveDocs(stem+'.changed.gz',states.changed),deleted:saveDocs(stem+'.deleted.gz',states.deleted)});save(manifestFile,manifest);}
  checked+=paths.length;pages++;after=paths.at(-1);if(pages%100===0)console.log(JSON.stringify({pathStates:checked,expected:counts.paths}));
 }
 if(checked!==counts.paths||manifest.stateChunks.length!==pages)throw new Error('Complete unique changed-path coverage required');
 const files=[await combine('changed.jsonl.gz',manifest.stateChunks.map(e=>e.changed)),await combine('deleted.jsonl.gz',manifest.stateChunks.map(e=>e.deleted)),await combine('journal-events.jsonl.gz',manifest.eventChunks)];
 if(files[0].records+files[1].records!==counts.paths)throw new Error('Typed states and tombstones do not cover path set');
 Object.assign(manifest,{complete:true,events,paths:counts.paths,changed:files[0].records,deleted:files[1].records,files,completedAt:new Date().toISOString()});save(manifestFile,manifest);console.log(JSON.stringify({complete:true,readonly:true,final:plan.final,events,paths:counts.paths,changed:manifest.changed,deleted:manifest.deleted,readTime:plan.readTime}));
}finally{await local.close().catch(()=>local.kill());await source.close();}
