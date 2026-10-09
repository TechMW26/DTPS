import {createHash} from 'node:crypto';
import {type Firestore} from 'firebase-admin/firestore';
import {canSendNativeMessage} from './native-messages';
import {nativeDates} from './native-plan-editor';
export const nativeConversationKey=(a:string,b:string)=>createHash('sha256').update([a,b].sort().join('\0')).digest('hex');
export async function listNativeConversations(db:Firestore,userId:string){
 const ready=await db.collection('_nativeMigrationState').doc('conversations').get();
 if(!ready.get('complete'))throw new Error('Conversation index is not ready');
 const [actor,indexes,unread]=await Promise.all([
  db.collection('users').doc(userId).get(),
  db.collection('_nativeConversations').where('userIds','array-contains',userId).get(),
  db.collection('messages').where('receiver','==',userId).where('isRead','==',false).select('sender','receiver','createdAt','deletedAt').get(),
 ]);
 if(!actor.exists)throw new Error('User not found');
 const counts=new Map<string,number>();for(const row of unread.docs)if(!row.get('deletedAt'))counts.set(row.get('sender'),(counts.get(row.get('sender'))||0)+1);
 // Reconcile older meal-photo writes that omitted the conversation index.
 // Reuse the unread query already required for badges; no collection scan.
 const byPeer=new Map(indexes.docs.map(doc=>{const row=doc.data();return [row.userIds.find((id:string)=>id!==userId)||userId,row];}));
 for(const doc of unread.docs){
  if(doc.get('deletedAt'))continue;
  const row=doc.data(),previous=byPeer.get(row.sender);
  if(!previous||new Date(nativeDates(row.createdAt)).getTime()>new Date(nativeDates(previous.updatedAt)).getTime())byPeer.set(row.sender,{userIds:[row.sender,userId],lastMessageId:doc.id,updatedAt:row.createdAt});
 }
 // Persist only repaired entries so opening (and marking read) cannot make
 // a recovered conversation disappear again. Preserve concurrent newer sends.
 const original=new Map(indexes.docs.map(doc=>[doc.id,doc.get('lastMessageId')]));
 const repairs=[...byPeer.values()].filter(row=>original.get(nativeConversationKey(row.userIds[0],row.userIds[1]))!==row.lastMessageId);
 for(let offset=0;offset<repairs.length;offset+=100){
  const batch=repairs.slice(offset,offset+100);
  await db.runTransaction(async tx=>{
   const refs=batch.map(row=>db.collection('_nativeConversations').doc(nativeConversationKey(row.userIds[0],row.userIds[1])));
   const fresh=await tx.getAll(...refs);
   batch.forEach((row,i)=>{if(!fresh[i].exists||new Date(nativeDates(row.updatedAt)).getTime()>new Date(nativeDates(fresh[i].get('updatedAt'))).getTime())tx.set(refs[i],row);});
  });
 }
 const allRecords=[...byPeer.values()];
 const result:any[]=[];
 for(let offset=0;offset<allRecords.length;offset+=100){
  const records=allRecords.slice(offset,offset+100);
  const peers=await db.getAll(...records.map(item=>db.collection('users').doc(item.userIds.find((id:string)=>id!==userId)||userId)),{fieldMask:['firstName','lastName','email','avatar','role','status','assignedDietitian','assignedDietitians','assignedHealthCounselor','assignedHealthCounselors']});
  const messages=await db.getAll(...records.map(item=>db.collection('messages').doc(item.lastMessageId)),{fieldMask:['content','type','sender','receiver','createdAt','isRead','deletedAt','_nativeExternalFields']});
  for(let i=0;i<records.length;i++){
   const peer=peers[i],message=messages[i];
   if(!peer.exists||!canSendNativeMessage(actor.data()!,peer.data()!,userId,peer.id))continue;
   let latest=message;
   if(!latest.exists||latest.get('deletedAt')){
    // Deleting the latest message exposes the previous message, never an empty or stale preview.
    const {Filter}=await import('firebase-admin/firestore');
    const candidates=await db.collection('messages').where(Filter.or(Filter.and(Filter.where('sender','==',userId),Filter.where('receiver','==',peer.id)),Filter.and(Filter.where('sender','==',peer.id),Filter.where('receiver','==',userId)))).orderBy('createdAt','desc').select('content','type','sender','receiver','createdAt','isRead','deletedAt','_nativeExternalFields').get();
    latest=candidates.docs.find(row=>!row.get('deletedAt'))!;
   }
   if(!latest)continue;
   const raw=nativeDates(latest.data());
   // Conversation previews do not contain attachment payloads or private profile fields.
   const lastMessage={_id:latest.id,content:raw.content||'',type:raw.type,sender:raw.sender,receiver:raw.receiver,createdAt:raw.createdAt,isRead:raw.isRead};
   result.push({user:{_id:peer.id,...Object.fromEntries(['firstName','lastName','email','avatar','role'].filter(key=>peer.get(key)!==undefined).map(key=>[key,peer.get(key)]))},lastMessage,unreadCount:counts.get(peer.id)||0});
  }
 }
 return result.sort((a,b)=>new Date(b.lastMessage.createdAt).getTime()-new Date(a.lastMessage.createdAt).getTime());
}
