import type {Firestore} from 'firebase-admin/firestore';
import {canSendNativeMessage} from '@/lib/db/repository/native-messages';
export async function touchNativePresence(db:Firestore,userId:string){
 await db.collection('_nativePresence').doc(userId).set({userId,lastSeen:new Date(),expiresAt:new Date(Date.now()+90_000)});
}
export async function nativePresence(db:Firestore,userId:string,requestedIds:string[],checkTyping:boolean){
 if(requestedIds.length>100||requestedIds.some(id=>!/^[a-f0-9]{24}$/i.test(id)))throw new Error('Invalid user IDs');
 const actor=await db.collection('users').doc(userId).get();
 if(!actor.exists||actor.get('status')==='inactive')throw new Error('Unauthorized');
 let ids=[...new Set(requestedIds)];
 if(!ids.length){
  const online=await db.collection('_nativePresence').where('expiresAt','>',new Date()).limit(1000).get();
  ids=online.docs.map(doc=>doc.id);
 }
 const users:Record<string,{isOnline:boolean;lastSeen:Date|null}>={},typing:Record<string,boolean>={};
 for(let offset=0;offset<ids.length;offset+=100){
  const chunk=ids.slice(offset,offset+100);
  const peers=await db.getAll(...chunk.map(id=>db.collection('users').doc(id)));
  const allowed=peers.filter(peer=>peer.exists&&(peer.id===userId||canSendNativeMessage(actor.data()!,peer.data()!,userId,peer.id)||canSendNativeMessage(peer.data()!,actor.data()!,peer.id,userId)));
  if(!allowed.length)continue;
  const presence=await db.getAll(...allowed.map(peer=>db.collection('_nativePresence').doc(peer.id)));
  for(const row of presence)users[row.id]={isOnline:!!row.exists&&row.get('expiresAt').toMillis()>Date.now(),lastSeen:row.get('lastSeen')?.toDate()||null};
  if(checkTyping){
   const values=await db.getAll(...allowed.map(peer=>db.collection('_nativeTyping').doc(`${peer.id}-${userId}`)));
   values.forEach((row,index)=>{typing[allowed[index].id]=!!row.exists&&row.get('isTyping')===true&&row.get('expiresAt').toMillis()>Date.now();});
  }
 }
 const onlineUsers=Object.entries(users).filter(([,state])=>state.isOnline).map(([id])=>id);
 return requestedIds.length?{users,...(checkTyping?{typing}:{})}:{onlineUsers,onlineCount:onlineUsers.length,...(checkTyping?{usersTypingToMe:Object.keys(typing).filter(id=>typing[id])}:{})};
}
