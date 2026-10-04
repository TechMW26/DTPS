// Aggregate private migration evidence without exposing records, URLs, or credentials.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import {createHash} from 'node:crypto';
const root=path.resolve('.migration-backups/firebase/native');
const read=name=>{const file=path.join(root,name);return fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):null;};
let malformedLedgerLines=0;
async function* rows(name){const file=path.join(root,name);if(!fs.existsSync(file))return;for await(const line of readline.createInterface({input:fs.createReadStream(file),crlfDelay:Infinity})){if(!line)continue;try{yield JSON.parse(line);}catch{malformedLedgerLines++;}}}
const snapshot=read('snapshots/manifest.json'),dates=read('date-resolution.json'),reconciliation=read('reconciliation/state.json');
const imports=fs.existsSync(path.join(root,'imports'))?fs.readdirSync(path.join(root,'imports')).filter(n=>n.endsWith('.json')).map(n=>read('imports/'+n)):[];
const assets=new Map();for await(const row of rows('media/migrated.jsonl'))assets.set(row.assetId,!!row.blob);
const references=new Set();for(const file of ['media/reference-copies.jsonl','media/reference-recoveries.jsonl','media/legacy-upload-copies.jsonl'])for await(const row of rows(file))if(row.urlHash)references.add(row.urlHash);
const expected=new Set();for(const file of ['media/references.jsonl',...fs.readdirSync(path.join(root,'media')).filter(n=>/^references-delta-\d+\.jsonl$/.test(n)).map(n=>'media/'+n)])for await(const row of rows(file)){if(row.host==='ik.imagekit.io'||/^https:\/\/(?:www\.)?dtps\.tech\/uploads\//.test(row.url||''))expected.add(createHash('sha256').update(new URL(row.url).href).digest('hex'));}
const failures=new Map();for await(const row of rows('media/failures.jsonl'))if(!assets.has(row.assetId))failures.set(row.assetId,row.code);
const failedReferences=new Map();for(const file of ['media/reference-failures.jsonl','media/legacy-upload-failures.jsonl'])for await(const row of rows(file))if(!references.has(row.urlHash))failedReferences.set(row.urlHash,row.code);
const skipPolicy=read('media/accepted-404-skips.json');
// Approval only excuses verified missing originals, never auth, transfer, or integrity failures.
const skippedAssets=new Set((skipPolicy?.sourceAssetIds||[]).filter(id=>failures.get(id)==='SOURCE_HTTP_404'));
const skippedReferences=new Set((skipPolicy?.urlHashes||[]).filter(id=>failedReferences.get(id)==='SOURCE_HTTP_404'));
const remainingReferences=[...expected].filter(id=>!references.has(id)&&!skippedReferences.has(id));
const existingBlob=read('media/existing-blob-delta-'+reconciliation?.line+'.json');
const acceptedBlob404s=existingBlob?.results?.filter(row=>row.status===404&&(skipPolicy?.urlHashes||[]).includes(row.hash)).length||0;
const counts=values=>{const out={};for(const code of values)out[code]=(out[code]||0)+1;return out;};
console.log(JSON.stringify({
 backups:snapshot?{collections:Object.keys(snapshot.collections).length,records:Object.values(snapshot.collections).reduce((n,v)=>n+v.count,0),complete:snapshot.complete}:null,
 nativeImport:{collectionsComplete:imports.filter(s=>s.complete).length,baseDocumentsVerified:imports.reduce((n,s)=>n+(Number(s.written)||0),0),baseQuarantined:imports.reduce((n,s)=>n+(Number(s.quarantined)||0),0),invalidDateResolution:dates},
 acceptedSourceWatermark:reconciliation?.line,requiresFinalSourceReconciliation:true,
 media:{verifiedAssets:assets.size,copied:[...assets.values()].filter(Boolean).length,existingBlob:[...assets.values()].filter(x=>!x).length,unavailableSourceAssets:failures.size,sourceFailureCodes:counts(failures.values()),accepted404SourceAssets:skippedAssets.size,unresolvedSourceAssets:failures.size-skippedAssets.size,verifiedUrlMappings:references.size,requiredUrlMappings:expected.size,accepted404UrlMappings:skippedReferences.size,remainingUrlMappings:remainingReferences.length,referenceFailureCodes:counts(failedReferences.values()),copyWorkerRunning:fs.existsSync(path.join(root,'media/reference-copy.lock'))},
 existingBlobDelta:existingBlob?{watermark:existingBlob.watermark,checked:existingBlob.total,reachable:existingBlob.reachable,accepted404s:acceptedBlob404s,unresolved:existingBlob.total-existingBlob.reachable-acceptedBlob404s}:null,
 malformedLedgerLines,productionCutover:false,sourceDeletionAllowed:false,
},null,2));
