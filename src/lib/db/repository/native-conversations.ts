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
  db.collection('messages').where('receiver','==',userId).where('isRead','==',false).select('sender','deletedAt').get(),
 ]);
 if(!actor.exists)throw new Error('User not found');
 const counts=new Map<string,number>();for(const row of unread.docs)if(!row.get('deletedAt'))counts.set(row.get('sender'),(counts.get(row.get('sender'))||0)+1);
 const result:any[]=[];
 for(let offset=0;offset<indexes.size;offset+=100){
  const records=indexes.docs.slice(offset,offset+100).map(doc=>doc.data());
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
