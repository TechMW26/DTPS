import fs from 'node:fs';
import path from 'node:path';
import {checkArchive,manifestAt} from './archive.mjs';
export async function bootstrapBaseline(dir,allowIncomplete=false){
 if(!allowIncomplete){const manifest=manifestAt(dir);await checkArchive(dir,manifest);return manifest;}
 const manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json')));
 if(manifest.complete||!manifest.project||!manifest.database||!Number.isFinite(Date.parse(manifest.readTime))||!Array.isArray(manifest.groups)||!Array.isArray(manifest.files)||!manifest.files.length)throw new Error('Incomplete bootstrap requires a valid partial snapshot manifest');
 const groups=new Map(manifest.groups.map(g=>[g.collection,g.total])),files=new Set();if(groups.size!==manifest.groups.length||[...groups.values()].some(n=>!Number.isSafeInteger(n)||n<1)||[...groups.values()].reduce((n,g)=>n+g,0)!==manifest.expectedDocuments)throw new Error('Partial snapshot group inventory is invalid');
 for(const file of manifest.files){if(files.has(file.group)||file.records!==groups.get(file.group))throw new Error('Partial snapshot shard coverage differs from inventory');files.add(file.group);}
 if(manifest.documents>=manifest.expectedDocuments||manifest.documents!==manifest.files.reduce((n,f)=>n+f.records,0))throw new Error('Partial snapshot document count is invalid');
 await checkArchive(dir,manifest);return {...manifest,bootstrapMissingGroups:[...groups.keys()].filter(g=>!files.has(g))};
}
