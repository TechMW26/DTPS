// Read-only indexed partitions avoid repeated unindexed name sorts and whole-bank streaming deadlines.
import fs from 'node:fs';
import path from 'node:path';
import {restValue,save,sha256,canonical} from './archive.mjs';
import {streamNames} from './inventory-stream.mjs';
export const LEADING={histories:['userId','createdAt'],messages:['sender','receiver'],notifications:['userId','read','createdAt']};
function equality(P,field,part){const f=P.field(field);if(part.lower)return P.and(f.greaterThanOrEqual(restValue(part.lower)),f.lessThan(restValue(part.upper)));if(part.absent)return f.isAbsent();if(part.typeOnly)return f.type().equal(part.typeOnly);const value=restValue(part.value);const same=f.equal(value);return ['string','boolean','null','timestamp'].includes(String(part.kind).toLowerCase())?same:P.and(same,f.type().equal(part.kind));}
function parentCondition(P,parent){if(!parent)return null;const clauses=(Array.isArray(parent)?parent:[parent]).map(p=>equality(P,p.field,p.part));return clauses.length===1?clauses[0]:P.and(...clauses);}
export function partitionQuery(source,group,field,parts,parent){const P=source.Pipelines;let condition;if(parts.length===1)condition=equality(P,field,parts[0]);else if(parts.every(p=>!p.absent&&p.kind===parts[0].kind&&Object.hasOwn(p.value||{},'stringValue')))condition=P.field(field).equalAny(parts.map(p=>p.value.stringValue));else condition=P.or(...parts.map(p=>equality(P,field,p)));if(parent)condition=P.and(parent,condition);return source.db.pipeline().collectionGroup(group).where(condition).select('__name__');}
export async function preparePartitions(source,group,expected,dir){
 const fields=LEADING[group];if(!fields)throw new Error('No measured leading-field partition strategy for this group');const file=path.join(dir,sha256(group).slice(0,20)+'-partitions.json');let plan=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):null;
 if(plan&&(plan.readTime!==source.readTime||plan.source!==`${source.project}/${source.database}`||plan.expected!==expected))throw new Error('Partition inventory snapshot differs');
 if(!plan){
  const P=source.Pipelines,partitions=[];const aggregate=(field,condition)=>{let q=source.db.pipeline().collectionGroup(group);if(condition)q=q.where(condition);return source.snapshot(q.aggregate({accumulators:[P.countAll().as('total')],groups:[P.field(field).as('key'),P.field(field).isAbsent().as('absent'),P.field(field).type().as('kind')]}));};
  const first=await aggregate(fields[0]);const rows=first.results.map(row=>({value:row._fieldsProto.key||null,absent:Boolean(row.get('absent')),kind:row.get('kind'),total:row.get('total')}));if(rows.reduce((n,r)=>n+r.total,0)!==expected)throw new Error('Leading partition totals differ from snapshot');
  const rowParts=result=>result.results.map(r=>({value:r._fieldsProto.key||null,absent:Boolean(r.get('absent')),kind:r.get('kind'),total:r.get('total')}));
  async function split(row,level,parent){
   const field=fields[level];if(row.total<=40000){partitions.push({field,parts:[row],...(parent.length?{parent}:{}),total:row.total});return;}
   if(level+1>=fields.length)throw new Error('Oversized indexed partition needs an additional bounded range strategy');
   const parents=[...parent,{field,part:row}],condition=parentCondition(P,parents),next=fields[level+1];
   if(next!=='createdAt'){const children=rowParts(await aggregate(next,condition));if(children.reduce((n,r)=>n+r.total,0)!==row.total)throw new Error('Secondary partition count is unsafe');for(const child of children)await split(child,level+1,parents);return;}
   // Group timestamp buckets once, then read disjoint indexed ranges; retain absent/non-timestamp rows explicitly.
   const typed=await source.snapshot(source.db.pipeline().collectionGroup(group).where(condition).aggregate({accumulators:[P.countAll().as('total')],groups:[P.field(next).isAbsent().as('absent'),P.field(next).type().as('kind')]}));
   if(typed.results.reduce((n,r)=>n+r.get('total'),0)!==row.total)throw new Error('Timestamp type partition totals differ');
   for(const typeRow of typed.results){const kind=typeRow.get('kind'),absent=Boolean(typeRow.get('absent')),total=typeRow.get('total'),typeCondition=absent?P.field(next).isAbsent():P.field(next).type().equal(kind),typedParents=[...parents,{field:next,part:{typeOnly:kind,absent}}];
    if(String(kind).toLowerCase()!=='timestamp'){if(total>40000)throw new Error('Oversized non-timestamp partition requires another indexed strategy');partitions.push({field:next,parts:[{typeOnly:kind,absent}],parent:parents,total});continue;}
    await timeBuckets(P.and(condition,typeCondition),typedParents,total,'day',86400000);
   }
   async function timeBuckets(where,parents,expected,unit,width){
    const buckets=await source.snapshot(source.db.pipeline().collectionGroup(group).where(where).aggregate({accumulators:[P.countAll().as('total')],groups:[P.field(next).timestampTruncate(unit,'UTC').as('key')]}));
    if(buckets.results.reduce((n,r)=>n+r.get('total'),0)!==expected)throw new Error('Timestamp bucket totals differ');
    for(const bucket of buckets.results){const lower=bucket._fieldsProto.key,start=Date.parse(lower?.timestampValue);if(!Number.isFinite(start))throw new Error('Timestamp partition key is invalid');const part={lower,upper:{timestampValue:new Date(start+width).toISOString()},kind:'timestamp',total:bucket.get('total')};
     if(part.total<=40000)partitions.push({field:next,parts:[part],parent:parents,total:part.total});else{const narrower={day:['hour',3600000],hour:['minute',60000],minute:['second',1000]}[unit];if(!narrower)throw new Error('Too many source records share one indexed second');await timeBuckets(P.and(where,equality(P,next,part)),[...parents,{field:next,part}],part.total,...narrower);}
    }
   }
  }
  for(const row of rows)await split(row,0,[]);
  // Batch at most 50 same-type scalar keys and 40k results per indexed stream.
  const batches=[];for(const part of partitions){const previous=batches.at(-1),key=JSON.stringify({field:part.field,parent:part.parent||null,kind:part.parts[0].kind,absent:part.parts[0].absent});if(previous&&previous.key===key&&previous.parts.length<50&&previous.total+part.total<=40000){previous.parts.push(...part.parts);previous.total+=part.total;}else batches.push({...part,key});}
  plan={source:`${source.project}/${source.database}`,group,readTime:source.readTime,expected,leadingField:fields[0],leadingKeys:rows.length,batches,complete:false};save(file,plan);
 }
 const shape=b=>JSON.stringify({field:b.field,parent:(Array.isArray(b.parent)?b.parent:b.parent?[b.parent]:[]).map(p=>p.field),kind:b.parts[0].kind,absent:b.parts[0].absent,range:Boolean(b.parts[0].lower),typeOnly:Boolean(b.parts[0].typeOnly)});
 const first=plan.batches.find(b=>!b.parts[0].absent&&b.parts[0].value?.stringValue!==undefined)||plan.batches[0];plan.explains??={};if(plan.explain&&!plan.explains[shape(first)])plan.explains[shape(first)]=plan.explain;
 const samples=new Map();for(const b of plan.batches)if(!samples.has(shape(b)))samples.set(shape(b),b);for(const [key,sample]of samples){
  if(plan.explains[key])continue;const parent=parentCondition(source.Pipelines,sample.parent),q=partitionQuery(source,group,sample.field,sample.parts,parent),result=await q._execute(source.timestamp,{explainOptions:{mode:'analyze',outputFormat:'text'}}),text=result.explainStats?.text||'',scanned=Number(text.match(/index row scanned:\s*([\d,]+)/)?.[1]?.replaceAll(',',''));
  if(!Number.isFinite(scanned)||scanned>sample.total*1.25+500||text.includes('MajorSort'))throw new Error('Partition Explain did not prove bounded index scanning');plan.explains[key]={expected:sample.total,scanned,stats:text};save(file,plan);
 }
 plan.explain=plan.explains[shape(first)];if(plan.batches.reduce((n,b)=>n+b.total,0)!==expected)throw new Error('Cached partition totals differ from snapshot');save(file,plan);
 return {plan,file};
}
export async function partitionedNames(source,group,expected,dir){
 fs.mkdirSync(dir,{recursive:true,mode:0o700});const {plan}=await preparePartitions(source,group,expected,dir),names=[],seen=new Set();let cursor=0;
 await Promise.all(Array.from({length:8},async()=>{for(;;){const batch=plan.batches[cursor++];if(!batch)break;const key=sha256(JSON.stringify(canonical(batch))).slice(0,32),file=path.join(dir,sha256(group).slice(0,12)+'-'+key+'.json');let values;
  if(fs.existsSync(file)){const old=JSON.parse(fs.readFileSync(file));if(old.readTime!==source.readTime||old.names.length!==batch.total||old.sha256!==sha256(JSON.stringify(old.names)))throw new Error('Completed partition checksum mismatch');values=old.names;}
  else{const parent=parentCondition(source.Pipelines,batch.parent);values=await streamNames(source.stream(partitionQuery(source,group,batch.field,batch.parts,parent)),group,batch.total);save(file,{readTime:source.readTime,names:values,sha256:sha256(JSON.stringify(values))});}
  for(const id of values){if(seen.has(id))throw new Error('Partitions overlap source identities');seen.add(id);names.push(id);}console.log(JSON.stringify({indexedPartition:true,group,documents:values.length,total:names.length,expected}));
 }}));if(names.length!==expected)throw new Error('Complete partition inventory count mismatch');return names;
}
