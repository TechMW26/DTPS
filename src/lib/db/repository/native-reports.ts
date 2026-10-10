import type * as MongoTypes from '@/lib/db/mongo-types';
import {createHash} from 'node:crypto';
import type {MongoDatabase,DocumentData} from '@/lib/db/mongo-types';
import {hydrateNativeDocument,prepareNativePatch} from '@/lib/storage/native-document';
import {nativeMediaParentAccess,type MediaActor,lookupNativeFile} from './native-media';
export class NativeReportError extends Error{constructor(message:string,public status:number){super(message);}}
function valid(id:string){if(!/^[a-f0-9]{24}$/.test(id))throw new NativeReportError('Invalid report ID',400);}
function references(row:MongoTypes.DocumentSnapshot){return [...new Set<string>((row.get('parents')||[]).filter((id:unknown)=>typeof id==='string'&&/^[a-f0-9]{24}$/.test(id)))];}
export async function lookupNativeReport(db:MongoDatabase,id:string,actor:MediaActor|null){
 valid(id);if(!actor)return null;
 const account=await db.collection('users').doc(actor.id).get();if(!account.exists||['inactive','suspended','deleted'].includes(account.get('status'))||account.get('isDeleted')||account.get('deletedAt'))return null;actor={id:actor.id,role:account.get('role')};
 const [file,grid,index]=await db.getAll(db.collection('files').doc(id),db.collection('medicalReports.files').doc(id),db.collection('_nativeReportReferences').doc(id));
 const source=file.exists?file:grid;if(!source.exists||source.get('deletedAt'))return null;
 let allowed=actor.role==='admin';
 if(file.exists&&!allowed){const media=await lookupNativeFile(db,id,actor);if(media)return media;}
 if(!allowed)for(const parentId of references(index)){
  const parent=await db.collection('medicalinfos').doc(parentId).get();if(!parent.exists||!await nativeMediaParentAccess(db,'medicalinfos',parent.data()!,actor))continue;
  const data=await hydrateNativeDocument(parent.data()!);if((data.reports||[]).some((report:DocumentData)=>report.id===id)){allowed=true;break;}
 }
 if(!allowed)return null;
 const asset=await db.collection('_mediaAssets').doc(createHash('sha256').update((file.exists?'files':'medicalReports.files')+'\0'+id).digest('hex')).get();
 if(asset.exists)return asset.data()!;
 if(file.exists&&file.get('storage')==='vercel-blob')return {url:file.get('imageKitUrl'),mimeType:file.get('mimeType'),originalName:file.get('originalName')};
 return null;
}
export async function deleteNativeReport(db:MongoDatabase,id:string,actor:MediaActor){
 valid(id);valid(actor.id);
 return db.runTransaction(async tx=>{
  const [account,file,grid,index]=await tx.getAll(db.collection('users').doc(actor.id),db.collection('files').doc(id),db.collection('medicalReports.files').doc(id),db.collection('_nativeReportReferences').doc(id));
  if(!account.exists||['inactive','suspended','deleted'].includes(account.get('status'))||account.get('isDeleted')||account.get('deletedAt'))throw new NativeReportError('Unauthorized',403);
  const role=account.get('role'),source=file.exists?file:grid;if(!source.exists)throw new NativeReportError('Report not found',404);
  const ids=references(index);if(ids.length>350)throw new NativeReportError('Shared report requires reconciliation',409);
  const parents=ids.length?await tx.getAll(...ids.map(parent=>db.collection('medicalinfos').doc(parent))):[];
  const current: {row:MongoTypes.DocumentSnapshot;data:DocumentData}[]=[];
  for(const row of parents)if(row.exists){const data=await hydrateNativeDocument(row.data()!);if((data.reports||[]).some((report:DocumentData)=>report.id===id))current.push({row,data});}
  const ownerIds=[...new Set(current.map(({data})=>data.userId).filter((value:unknown)=>typeof value==='string'&&/^[a-f0-9]{24}$/.test(value)))];
  const owners=ownerIds.length?await tx.getAll(...ownerIds.map(owner=>db.collection('users').doc(owner))):[];
  const canAccess=(owner:string)=>{
   if(role==='admin'||owner===actor.id)return true;
   const client=owners.find(row=>row.id===owner);if(!client?.exists)return false;
   const assigned=role==='dietitian'?[client.get('assignedDietitian'),...(client.get('assignedDietitians')||[])]:role==='health_counselor'?[client.get('assignedHealthCounselor'),...(client.get('assignedHealthCounselors')||[])]:[];
   return assigned.includes(actor.id);
  };
  if(current.some(({data})=>!canAccess(data.userId))||(!current.length&&role!=='admin'&&file.get('uploadedBy')!==actor.id))throw new NativeReportError('Report access denied',403);
  const now=new Date();
  for(const {row,data} of current)tx.update(row.ref,await prepareNativePatch(row.data()!,{reports:data.reports.filter((report:DocumentData)=>report.id!==id),updatedAt:now}));
  if(file.exists)tx.update(file.ref,{deletedAt:now,updatedAt:now});if(grid.exists)tx.update(grid.ref,{deletedAt:now});
  // Preserve the physical Blob for audit/recovery and other references until garbage collection.
  return true;
 });
}
