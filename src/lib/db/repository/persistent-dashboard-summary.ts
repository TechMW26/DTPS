import {createHash} from 'node:crypto';
import type {Firestore} from 'firebase-admin/firestore';

// Event delivery is asynchronous. Bound reuse even if a trigger is delayed or down.
export const SUMMARY_MAX_AGE_MS=30_000;
const MAX_BYTES=700_000;
export function dashboardSummaryKey(parts:unknown[]){return createHash('sha256').update(JSON.stringify(['v1',...parts])).digest('hex');}

/** Internal aggregate cache only. Callers must resolve current authorized IDs first. */
export async function persistentDashboardSummary<T>(db:Firestore,collection:'clientmealplans'|'unifiedpayments',key:string,load:()=>Promise<T>,clock=Date.now):Promise<T>{
 const revisionRef=db.collection('_nativeDashboardRevisions').doc(collection);
 const cacheRef=db.collection('_nativeDashboardSummaries').doc(key);
 let revision:string;
 try{
  const [version,cached]=await db.getAll(revisionRef,cacheRef);
  // A deployed trigger must have processed at least one event. Missing state fails open to live computation.
  revision=version.get('revision');
  if(typeof revision!=='string')return load();
  const data=cached.data(),age=clock()-Number(data?.computedAt);
  if(data?.version===1&&data.collection===collection&&data.revision===revision&&age>=0&&age<SUMMARY_MAX_AGE_MS&&typeof data.payload==='string'){
   return JSON.parse(data.payload) as T;
  }
 }catch{return load();}
 const began=clock(),result=await load();
 // Never store oversized, non-JSON, or already-expired calculations. Cache failures cannot break reads.
 try{
  const payload=JSON.stringify(result);
  if(!payload||Buffer.byteLength(payload)>MAX_BYTES||clock()-began>=SUMMARY_MAX_AGE_MS)return result;
  await db.runTransaction(async tx=>{
   const latest=await tx.get(revisionRef);
   if(latest.get('revision')!==revision)return;
   tx.set(cacheRef,{version:1,collection,revision,computedAt:began,payload,expiresAt:new Date(began+SUMMARY_MAX_AGE_MS)});
  });
 }catch{/* The live result remains authoritative when caching is unavailable. */}
 return result;
}
