import {Filter,FieldPath,type Firestore,type DocumentData} from 'firebase-admin/firestore';
import {nativeDates} from './native-plan-editor';
import {hydrateNativeDocument} from '@/lib/storage/native-document';

export async function nativeClientConversation(db:Firestore,userId:string){
 const client=await db.collection('users').doc(userId).get();
 const staffId=client.get('assignedDietitian');if(typeof staffId!=='string'||!staffId||staffId.includes('/'))return null;
 const staff=await db.collection('users').doc(staffId).get();if(!staff.exists)return null;
 const query=db.collection('messages').where(Filter.or(
  Filter.and(Filter.where('sender','==',userId),Filter.where('receiver','==',staffId)),
  Filter.and(Filter.where('sender','==',staffId),Filter.where('receiver','==',userId)),
 )).orderBy('createdAt','desc').orderBy(FieldPath.documentId(),'desc').select('content','type','createdAt','isRead','sender','receiver','deletedAt','_nativeExternalFields');
 let cursor:FirebaseFirestore.QueryDocumentSnapshot|undefined,lastMessage:DocumentData|null=null;
 for(;;){
  const rows=await (cursor?query.startAfter(cursor):query).limit(25).get();
  const latest=rows.docs.find(doc=>!doc.get('deletedAt'));
  if(latest){const raw=latest.data();raw._nativeExternalFields=(raw._nativeExternalFields||[]).filter((ref:any)=>ref.path?.[0]==='content');lastMessage={...nativeDates(await hydrateNativeDocument(raw)),_id:latest.id};delete lastMessage!._nativeExternalFields;break;}
  if(rows.size<25)break;cursor=rows.docs.at(-1);
 }
 const unread=await db.collection('messages').where('sender','==',staffId).where('receiver','==',userId).where('isRead','==',false).select('deletedAt').get();
 return {_id:staffId,user:{_id:staffId,...Object.fromEntries(['firstName','lastName','avatar','role'].filter(key=>staff.get(key)!==undefined).map(key=>[key,staff.get(key)]))},lastMessage,unreadCount:unread.docs.filter(doc=>!doc.get('deletedAt')).length};
}
