import {Filter,type Firestore,type DocumentData} from 'firebase-admin/firestore';
import {NativeMessageError,nativeMessageView} from './native-messages';
const valid=(id:unknown)=>typeof id==='string'&&/^[a-f0-9]{24}$/.test(id);
export async function updateNativeMessageStatus(db:Firestore,userId:string,input:{messageId?:string;conversationWith?:string;status:string}){
 if(!['delivered','read','failed'].includes(input.status))throw new NativeMessageError('Invalid status',400);
 const now=new Date();
 const patch=(row:DocumentData)=>{
  // Read receipts are monotonic. An out-of-order delivery update cannot make a read message unread.
  if(row.isRead||row.status==='read')return {status:'read',isRead:true};
  if(input.status==='read')return {status:'read',isRead:true,readAt:now,deliveredAt:row.deliveredAt||now};
  return {status:input.status,...(input.status==='delivered'?{deliveredAt:row.deliveredAt||now}:{})};
 };
 if(input.messageId){
  if(!valid(input.messageId))throw new NativeMessageError('Invalid message ID',400);
  const ref=db.collection('messages').doc(input.messageId);
  const value=await db.runTransaction(async tx=>{
   const row=await tx.get(ref);if(!row.exists||row.get('deletedAt'))throw new NativeMessageError('Message not found',404);
   if(row.get('receiver')!==userId)throw new NativeMessageError('Forbidden',403);
   const update=patch(row.data()!);tx.update(ref,update);return {...row.data(),...update};
  });
  return {message:await nativeMessageView(db,ref.id,value),updatedCount:1};
 }
 if(!valid(input.conversationWith)||input.status==='failed')throw new NativeMessageError('Invalid conversation status update',400);
 let count=0,cursor:FirebaseFirestore.QueryDocumentSnapshot|undefined;
 const base=db.collection('messages').where('sender','==',input.conversationWith).where('receiver','==',userId).where('isRead','==',false).orderBy('__name__');
 for(;;){
  const rows=await (cursor?base.startAfter(cursor):base).limit(200).get();if(rows.empty)break;
  count+=await db.runTransaction(async tx=>{
   const fresh=await tx.getAll(...rows.docs.map(row=>row.ref));let changed=0;
   for(const row of fresh)if(row.exists&&!row.get('deletedAt')&&!row.get('isRead')&&row.get('receiver')===userId){tx.update(row.ref,patch(row.data()!));changed++;}return changed;
  });
  if(rows.size<200)break;cursor=rows.docs.at(-1);
 }
 return {updatedCount:count};
}
export async function nativeMessageStatus(db:Firestore,userId:string,peer:string){
 if(!valid(peer))throw new NativeMessageError('Invalid conversation',400);
 const rows=await db.collection('messages').where(Filter.or(Filter.and(Filter.where('sender','==',userId),Filter.where('receiver','==',peer)),Filter.and(Filter.where('sender','==',peer),Filter.where('receiver','==',userId)))).select('status','isRead','readAt','receiver','deletedAt').get();
 const statusCounts:Record<string,number>={};let unreadCount=0,lastReadAt:Date|null=null;
 for(const row of rows.docs){if(row.get('deletedAt'))continue;const status=row.get('status')||(row.get('isRead')?'read':'sent');statusCounts[status]=(statusCounts[status]||0)+1;
  if(row.get('receiver')===userId){if(!row.get('isRead'))unreadCount++;else {const date=row.get('readAt')?.toDate();if(date&&(!lastReadAt||date>lastReadAt))lastReadAt=date;}}
 }
 return {statusCounts,unreadCount,lastReadAt};
}
