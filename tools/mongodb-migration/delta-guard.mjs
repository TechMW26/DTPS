import fs from 'node:fs';
import path from 'node:path';
import {fileHash} from './archive.mjs';
export function baselineProof(manifest,filename,database,excludeArchives){
 const proof=JSON.parse(fs.readFileSync(filename));const source=`${manifest.project}/${manifest.database}`,run=`${source}@${manifest.baselineReadTime}${excludeArchives?':without-archives':''}`;
 if(!manifest.baselineReadTime||!manifest.baselineFiles?.length||!proof.complete||proof.source!==source||proof.database!==database||proof.run!==run||proof.readTime!==manifest.baselineReadTime)throw new Error('Complete matching baseline target verification is required');
 for(const file of manifest.baselineFiles)if(!proof.archiveFiles?.some(f=>f.file===file.file&&f.sha256===file.sha256&&f.records===file.records))throw new Error('Baseline proof archive checksums differ');
 if(proof.verified+(proof.excludedArchivedLocally||0)!==manifest.baselineFiles.reduce((n,f)=>n+f.records,0))throw new Error('Baseline proof total is incomplete');
 return proof;
}
export async function checkDeltaFiles(dir,manifest){
 for(const file of manifest.deltaFiles||[]){if(!/^[a-zA-Z0-9_.-]+$/.test(file.file)||await fileHash(path.join(dir,file.file))!==file.sha256)throw new Error('Delta archive checksum mismatch');}
 for(const name of ['changed.jsonl.gz','deleted.jsonl.gz','metadata.jsonl.gz'])if(!manifest.deltaFiles?.some(f=>f.file===name))throw new Error('Complete final delta files required');
}
