import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {partitionQuery,preparePartitions} from './partitioned-inventory.mjs';
import {proveNameSeek} from './indexed-names.mjs';
const expression=value=>new Proxy(value,{get:(t,key)=>key in t?t[key]:(...args)=>expression({op:key,field:t.name??t.field,args})});
const field=name=>expression({name});
const P={field,and:(...args)=>({op:'and',args}),or:(...args)=>({op:'or',args}),countAll:()=>({as:alias=>({count:alias})})};
function query(){return {collectionGroup(group){this.group=group;return this;},where(condition){this.condition=condition;return this;},select(){return this;},aggregate(spec){this.spec=spec;return this;},async _execute(){return {explainStats:{text:'index row scanned: 30,000'}};}};}
const result=(values)=>({results:values.map(({value,...data})=>({_fieldsProto:value?{key:value}:{},get:k=>data[k]}))});

test('typed partitions preserve absent/null distinction and disjoint timestamp range bounds',()=>{
 const s={Pipelines:P,db:{pipeline:query}};
 const absent=partitionQuery(s,'messages','sender',[{absent:true}]);assert.equal(absent.condition.op,'isAbsent');
 const nil=partitionQuery(s,'messages','sender',[{kind:'null',value:{nullValue:null}}]);assert.equal(nil.condition.op,'equal');assert.equal(nil.condition.args[0],null);
 const range=partitionQuery(s,'notifications','createdAt',[{lower:{timestampValue:'2026-10-01T00:00:00Z'},upper:{timestampValue:'2026-10-02T00:00:00Z'}}]);assert.deepEqual(range.condition.args.map(x=>x.op),['greaterThanOrEqual','lessThan']);
});

test('large notification owner partitions split on indexed read and timestamp buckets with exact totals',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dtps-partition-'));let at=0;
 const rows=[result([{value:{stringValue:'fixture-owner'},kind:'string',absent:false,total:80001}]),result([{value:{booleanValue:true},kind:'boolean',absent:false,total:80001}]),result([{kind:'timestamp',absent:false,total:80001}]),result([30000,30000,20001].map((total,i)=>({value:{timestampValue:`2026-10-0${i+1}T00:00:00Z`},total})))];
 const s={project:'fixture',database:'fixture',readTime:'2026-10-10T00:00:00Z',Pipelines:P,db:{pipeline:query},snapshot:async()=>rows[at++]};
 try{const {plan}=await preparePartitions(s,'notifications',80001,dir);assert.equal(at,4);assert.equal(plan.batches.length,3);assert.equal(plan.batches.reduce((n,b)=>n+b.total,0),80001);assert(plan.batches.every(b=>b.field==='createdAt'&&b.parts[0].lower&&b.parts[0].upper&&b.parent.length===3));await preparePartitions(s,'notifications',80001,dir);assert.equal(at,4);await assert.rejects(()=>preparePartitions({...s,readTime:'2026-10-11T00:00:00Z'},'notifications',80001,dir),/snapshot differs/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('name pages require measured bounded scanning and reject the previously expensive plan',()=>{
 assert.equal(proveNameSeek('index row scanned: 5,000',5000).scanned,5000);
 assert.throws(()=>proveNameSeek('index row scanned: 826,197 MajorSort',5000),/bounded indexed scanning/);
 assert.throws(()=>proveNameSeek('index row scanned: 826,197',5000),/bounded indexed scanning/);
});
