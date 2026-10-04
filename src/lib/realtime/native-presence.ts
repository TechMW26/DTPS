import type {Firestore} from 'firebase-admin/firestore';
import {canSendNativeMessage} from '@/lib/db/repository/native-messages';
// Keep this projection aligned with canSendNativeMessage. No health/profile payloads
// are needed to authorize presence, and permissions are always read fresh.
const permissionFields=['role','status','isDeleted','assignedDietitian','assignedDietitians','assignedHealthCounselor','assignedHealthCounselors'];
export async function touchNativePresence(db:Firestore,userId:string){
 await db.collection('_nativePresence').doc(userId).set({userId,lastSeen:new Date(),expiresAt:new Date(Date.now()+90_000)});
}
export async function nativePresence(db:Firestore,userId:string,requestedIds:string[],checkTyping:boolean){
 if(requestedIds.length>100||requestedIds.some(id=>!/^[a-f0-9]{24}$/i.test(id)))throw new Error('Invalid user IDs');
 const [actor]=await db.getAll(db.collection('users').doc(userId),{fieldMask:permissionFields});
 if(!actor.exists||actor.get('status')==='inactive')throw new Error('Unauthorized');
 let ids=[...new Set(requestedIds)];
 let onlineRows:Map<string,FirebaseFirestore.QueryDocumentSnapshot>|undefined;
 if(!ids.length){
  const online=await db.collection('_nativePresence').where('expiresAt','>',new Date()).limit(1000).get();
  ids=online.docs.map(doc=>doc.id);
  onlineRows=new Map(online.docs.map(doc=>[doc.id,doc]));
 }
 const users:Record<string,{isOnline:boolean;lastSeen:Date|null}>={},typing:Record<string,boolean>={};
 for(let offset=0;offset<ids.length;offset+=100){
  const chunk=ids.slice(offset,offset+100);
  const peers=await db.getAll(...chunk.map(id=>db.collection('users').doc(id)),{fieldMask:permissionFields});
  const allowed=peers.filter(peer=>peer.exists&&(peer.id===userId||canSendNativeMessage(actor.data()!,peer.data()!,userId,peer.id)||canSendNativeMessage(peer.data()!,actor.data()!,peer.id,userId)));
  if(!allowed.length)continue;
  const [presence,values]=await Promise.all([
   // The online query already read these rows; reuse them within this request.
   onlineRows?Promise.resolve(allowed.map(peer=>onlineRows!.get(peer.id)!)):db.getAll(...allowed.map(peer=>db.collection('_nativePresence').doc(peer.id))),
   checkTyping?db.getAll(...allowed.map(peer=>db.collection('_nativeTyping').doc(`${peer.id}-${userId}`))):Promise.resolve([]),
  ]);
  for(const row of presence)users[row.id]={isOnline:!!row.exists&&row.get('expiresAt').toMillis()>Date.now(),lastSeen:row.get('lastSeen')?.toDate()||null};
  if(checkTyping){
   values.forEach((row,index)=>{typing[allowed[index].id]=!!row.exists&&row.get('isTyping')===true&&row.get('expiresAt').toMillis()>Date.now();});
  }
 }
 const onlineUsers=Object.entries(users).filter(([,state])=>state.isOnline).map(([id])=>id);
 return requestedIds.length?{users,...(checkTyping?{typing}:{})}:{onlineUsers,onlineCount:onlineUsers.length,...(checkTyping?{usersTypingToMe:Object.keys(typing).filter(id=>typing[id])}:{})};
}
