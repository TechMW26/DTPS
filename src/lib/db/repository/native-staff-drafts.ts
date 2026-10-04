import {createHash} from 'node:crypto';
import type {Firestore} from 'firebase-admin/firestore';
import {hydrateNativeDocument,prepareNativePatch,prepareNativeDocument} from '@/lib/storage/native-document';
import {NativeStaffClientError} from './native-staff-client';
import {nativeJson} from './native-history';
export async function nativeDraft(db:Firestore,userId:string,type:unknown,id:unknown,method:'GET'|'POST'|'DELETE',data?:unknown){
 if(typeof type!=='string'||!type||type.length>100||typeof id!=='string'||!id||id.length>500)throw new NativeStaffClientError('Missing or invalid type/id');if(method==='POST'&&(data===undefined||data===null||JSON.stringify(data).length>16*1024*1024))throw new NativeStaffClientError('Draft data missing or too large');
 return db.runTransaction(async tx=>{const actor=await tx.get(db.collection('users').doc(userId));if(!actor.exists||(['inactive','suspended'].includes(actor.get('status'))||actor.get('isActive')===false))throw new NativeStaffClientError('Unauthorized',401);const rows=await tx.get(db.collection('drafts').where('userId','==',userId).where('type','==',type).where('draftId','==',id).limit(2));if(rows.size>1)throw new NativeStaffClientError('Duplicate draft needs reconciliation',409);const row=rows.docs[0];
  if(method==='GET'){if(!row||row.get('lastSaved')?.toMillis()<Date.now()-604800000)return {draft:null};const draft=await hydrateNativeDocument(row.data());return {draft:nativeJson({id:draft.draftId,type:draft.type,data:draft.data,lastSaved:draft.lastSaved})};}
  if(method==='DELETE'){if(row)tx.delete(row.ref);return {success:true};}
  const now=new Date(),patch={data,lastSaved:now,updatedAt:now,expiresAt:new Date(now.getTime()+604800000)},ref=row?.ref||db.collection('drafts').doc(createHash('sha256').update(userId+'\0'+type+'\0'+id).digest('hex').slice(0,24));if(row)tx.update(ref,await prepareNativePatch(row.data(),patch));else tx.create(ref,await prepareNativeDocument({...patch,_id:ref.id,userId,type,draftId:id,createdAt:now}));return {success:true,draft:{id,type,lastSaved:now}};
 });
}
