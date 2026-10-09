import {createHash} from 'node:crypto';
import type {Firestore,DocumentData} from 'firebase-admin/firestore';
import {hydrateNativeDocument} from '@/lib/storage/native-document';
export interface MediaActor {id:string;role:string}
export const nativeMediaHash=(url:string)=>createHash('sha256').update(new URL(url).href).digest('hex');
async function currentMediaActor(db:Firestore,actor:MediaActor|null){
 if(!actor)return null;const [row]=await db.getAll(db.collection('users').doc(actor.id),{fieldMask:['status','isDeleted','role']});
 if(!row.exists||['inactive','suspended','deleted'].includes(row.get('status'))||row.get('isDeleted')||!['admin','dietitian','health_counselor','client'].includes(row.get('role')))return null;
 return {id:actor.id,role:row.get('role') as string};
}
async function clientAccess(db:Firestore,actor:MediaActor|null,id:unknown){
 if(!actor||typeof id!=='string'||!id||id.includes('/'))return false;
 if(actor.id===id||actor.role==='admin')return true;
 if(!['dietitian','dietician','health_counselor'].includes(actor.role))return false;
 const [row]=await db.getAll(db.collection('users').doc(id),{fieldMask:['assignedHealthCounselor','assignedHealthCounselors','assignedDietitian','assignedDietitians']});if(!row.exists)return false;
 return actor.role==='health_counselor'?[row.get('assignedHealthCounselor'),...(row.get('assignedHealthCounselors')||[])].includes(actor.id):[row.get('assignedDietitian'),...(row.get('assignedDietitians')||[])].includes(actor.id);
}
export async function nativeMediaParentAccess(db:Firestore,collection:string,data:DocumentData,actor:MediaActor|null,referencePath?:unknown[]){
 if(data.deletedAt||data.isDeleted)return false;
 if(actor?.role==='admin')return true;
 if(collection==='blogs'||collection==='transformations')return data.isActive===true;
 if(collection==='recipes')return data.isActive===true&&(data.isPublic===true||!!actor);
 if(collection==='messages')return !!actor&&(data.sender===actor.id||data.receiver===actor.id);
 if(collection==='users'){
  if(referencePath?.length===1&&['avatar','profileImage'].includes(String(referencePath[0])))return !!actor;
  return clientAccess(db,actor,data._id);
 }
 if(collection==='files')return clientAccess(db,actor,data.uploadedBy);
 if(collection==='clientmealplans'){
  if(actor?.id===(data.clientId||data.client)&&!['active','paused','completed'].includes(data.status))return false;
  return clientAccess(db,actor,data.clientId||data.client);
 }
 if(collection==='medicalinfos'||collection==='progressentries')return clientAccess(db,actor,data.userId||data.client);
 if(collection==='unifiedpayments'||collection==='otherplatformpayments')return clientAccess(db,actor,data.client||data.clientId||data.userId);
 return false;
}
async function messageMediaAccess(db:Firestore,actor:MediaActor|null,field:'fileId'|'urlHash',value:string){
 if(!actor)return false;
 const query=db.collection('_nativeMessageMedia').where(field,'==',value).where('participants','array-contains',actor.id);
 let cursor:FirebaseFirestore.QueryDocumentSnapshot|undefined;
 for(;;){const rows=await(cursor?query.startAfter(cursor):query).limit(50).get();
  for(const grant of rows.docs){const id=grant.get('messageId');if(typeof id!=='string'||!/^[a-f0-9]{24}$/.test(id))continue;
   const message=await db.collection('messages').doc(id).get();if(!message.exists||message.get('deletedAt')||![message.get('sender'),message.get('receiver')].includes(actor.id))continue;
   const body=await hydrateNativeDocument(message.data()!);
   if((body.attachments||[]).some((attachment:DocumentData)=>field==='fileId'?(attachment.fileId===value&&attachment.url==='/api/files/'+value):attachment.url===grant.get('url')))return true;
  }
  if(rows.size<50)return false;cursor=rows.docs.at(-1);
 }
}
export async function canReadNativeMediaUrl(db:Firestore,url:string,actor:MediaActor|null){
 if(actor?.role==='admin')return true;
 if(await messageMediaAccess(db,actor,'urlHash',nativeMediaHash(url)))return true;
 const hash=nativeMediaHash(url),query=db.collection('_nativeMediaReferences').where('urlHash','==',hash);
 let cursor:FirebaseFirestore.QueryDocumentSnapshot|undefined;
 for(;;){
  const rows=await (cursor?query.startAfter(cursor):query).limit(10).get();
  for(const chunk of rows.docs)for(const reference of chunk.get('references')||[]){
   if(typeof reference.collection!=='string'||reference.collection.includes('/')||typeof reference.id!=='string'||reference.id.includes('/'))continue;
   const row=await db.collection(reference.collection).doc(reference.id).get();
   if(!row.exists||!await nativeMediaParentAccess(db,reference.collection,{...row.data(),_id:row.id},actor,reference.path))continue;
   const data=await hydrateNativeDocument(row.data()!);let value:any=data;
   for(const key of reference.path||[])value=value?.[key];
   // Recheck the live source field: deleting or replacing an attachment revokes its grant.
   if(typeof value==='string'&&(value===`/api/media/${hash}`||value.includes(url)||(()=>{try{return new URL(value).href===url;}catch{return false;}})()))return true;
  }
  if(rows.size<10)return false;cursor=rows.docs.at(-1);
 }
}
export async function lookupNativeMedia(db:Firestore,hash:string,actor:MediaActor|null){
 if(!/^[a-f0-9]{64}$/.test(hash))return null;
 actor=await currentMediaActor(db,actor);
 const row=await db.collection('_nativeMediaUrls').doc(hash).get();if(!row.exists)return null;
 const data=row.data()!;if(typeof data.sourceUrl!=='string'||!await canReadNativeMediaUrl(db,data.sourceUrl,actor))return null;
 return data;
}
export async function lookupNativeFile(db:Firestore,id:string,actor:MediaActor|null){
 if(!/^[a-f0-9]{24}$/.test(id))return null;
 actor=await currentMediaActor(db,actor);
 const row=await db.collection('files').doc(id).get();if(!row.exists||row.get('deletedAt'))return null;
 const file=row.data()!,sourceUrl=file.imageKitUrl;
 if(!await nativeMediaParentAccess(db,'files',file,actor)&&!await messageMediaAccess(db,actor,'fileId',id)&&!(typeof sourceUrl==='string'&&await canReadNativeMediaUrl(db,new URL(sourceUrl).href,actor)))return null;
 const asset=await db.collection('_mediaAssets').doc(createHash('sha256').update('files\0'+id).digest('hex')).get();
 if(asset.exists)return {...asset.data(),originalName:file.originalName,mimeType:file.mimeType};
 if(file.storage==='vercel-blob'&&typeof sourceUrl==='string'&&new URL(sourceUrl).hostname.endsWith('.public.blob.vercel-storage.com'))return {url:sourceUrl,originalName:file.originalName,mimeType:file.mimeType};
 return null;
}
