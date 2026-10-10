// Transitional source index metadata only; never writes source business documents or deletes indexes.
import fs from 'node:fs';
import {arg,save} from './archive.mjs';
import {sourceConnection} from './source.mjs';
const group=arg('--group','messages'),planFile=arg('--plan');if(!planFile||!arg('--entries')||!arg('--max-name-bytes'))throw new Error('Explicit --plan, --entries and observed --max-name-bytes required');
const entries=Number(arg('--entries')),nameBytes=Number(arg('--max-name-bytes')),growth=Number(arg('--growth-margin','0.1'));if(!Number.isSafeInteger(entries)||entries<1||!Number.isSafeInteger(nameBytes)||nameBytes<1||growth<0||growth>1)throw new Error('Invalid bounded estimate');
const maxEntries=Math.ceil(entries*(1+growth)),bytesPerEntry=2*nameBytes+Buffer.byteLength(group)+128,maxBytes=maxEntries*bytesPerEntry,writeUnits=maxEntries*Math.ceil(bytesPerEntry/1024),spec={queryScope:'COLLECTION_GROUP',apiScope:'ANY_API',density:'DENSE',fields:[{fieldPath:'__name__',order:'ASCENDING'}]};
const plan={group,source:'dtps-2cbac/dtps-native-staging',reason:'Export name ordering has no source name index: full scan/MajorSort and structural deadline/memory errors',spec,estimate:{snapshotEntries:entries,growthMargin:growth,maxEstimatedEntries:maxEntries,observedMaxResourceNameBytes:nameBytes,estimatedUpperBytesPerEntry:bytesPerEntry,estimatedUpperIndexBytes:maxBytes,estimatedUpperIndexWriteUnits:writeUnits},pricing:{reference:'https://cloud.google.com/firestore/enterprise/pricing',writeUsdPerMillion:0.26,estimatedIndexWriteUsd:writeUnits/1e6*0.26,warning:'Published baseline price only; Mumbai/account currency SKUs, metadata/backfill work and growth affect actual charges. Observed-ID sizing plus overhead is an estimate, not a hard provider limit or invoice guarantee.'},created:false};
if(!process.argv.includes('--execute')){save(planFile,plan);console.log(JSON.stringify({dryRun:true,group,spec,estimate:plan.estimate,pricing:plan.pricing}));process.exit(0);}
if(!fs.existsSync(planFile))throw new Error('Save the exact plan before executing');const approved=JSON.parse(fs.readFileSync(planFile));if(JSON.stringify(approved.spec)!==JSON.stringify(spec)||approved.group!==group||approved.estimate.maxEstimatedEntries!==maxEntries||approved.estimate.observedMaxResourceNameBytes!==nameBytes)throw new Error('Saved index plan differs');
const source=sourceConnection(new Date(Math.floor(Date.now()/60000)*60000).toISOString());
try{
 const route='collectionGroups/'+encodeURIComponent(group)+'/indexes';const existing=await source.control(route);const match=(existing.indexes||[]).find(i=>i.queryScope===spec.queryScope&&JSON.stringify(i.fields)===JSON.stringify(spec.fields));
 if(match){save(planFile,{...approved,existingIndex:match.name,state:match.state});console.log(JSON.stringify({existing:true,group,state:match.state}));}
 else{const operation=await source.control(route,spec,'POST');save(planFile,{...approved,created:true,operation:operation.name,metadata:operation.metadata,startedAt:new Date().toISOString()});console.log(JSON.stringify({created:true,group,operation:operation.name}));}
}finally{await source.close();}
