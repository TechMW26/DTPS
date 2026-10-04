import {createHash,randomBytes} from 'node:crypto';
import {Filter,FieldPath,type Firestore,type DocumentData} from 'firebase-admin/firestore';
import {z} from 'zod';
import {MessageType} from '@/types';
import {hydrateNativeDocument,prepareNativeDocument} from '@/lib/storage/native-document';
import {nativeJson} from './native-history';

export class NativeMessageError extends Error {constructor(message:string,public status:number){super(message);}}
const idSchema=z.string().regex(/^[a-f0-9]{24}$/);
const inputSchema=z.object({recipientId:idSchema,content:z.string().max(2000).default(''),type:z.nativeEnum(MessageType).default(MessageType.TEXT),replyTo:idSchema.optional(),forwardSourceId:idSchema.optional(),attachments:z.array(z.object({url:z.string().max(4000),filename:z.string().max(500),size:z.number().nonnegative(),mimeType:z.string().max(200),fileId:idSchema.optional(),thumbnail:z.string().max(4000).optional(),duration:z.number().nonnegative().optional(),width:z.number().nonnegative().optional(),height:z.number().nonnegative().optional()})).max(20).default([])}).refine(value=>value.content.trim().length>0||value.attachments.length>0,'Message is empty');
const viewFields=['content','type','attachments','sender','receiver','createdAt','updatedAt','isRead','readAt','deliveredAt','editedAt','status','reactions','isForwarded','replyTo'];
const pair=(a:string,b:string)=>Filter.or(Filter.and(Filter.where('sender','==',a),Filter.where('receiver','==',b)),Filter.and(Filter.where('sender','==',b),Filter.where('receiver','==',a)));
const samePair=(row:DocumentData,a:string,b:string)=>(row.sender===a&&row.receiver===b)||(row.sender===b&&row.receiver===a);
async function publicPerson(db:Firestore,id:string){
 if(typeof id!=='string'||id.includes('/'))return null;
 const row=await db.collection('users').doc(id).get();if(!row.exists)return null;
 return {_id:id,...Object.fromEntries(['firstName','lastName','avatar','role'].filter(key=>row.get(key)!==undefined).map(key=>[key,row.get(key)]))};
}
export async function nativeMessageView(db:Firestore,id:string,raw:DocumentData,people=new Map<string,Promise<Awaited<ReturnType<typeof publicPerson>>>>()){
 const person=(userId:string)=>{let pending=people.get(userId);if(!pending){pending=publicPerson(db,userId);people.set(userId,pending);}return pending;};
 const data=Object.fromEntries(viewFields.filter(key=>raw[key]!==undefined).map(key=>[key,raw[key]]));
 data._nativeExternalFields=(raw._nativeExternalFields||[]).filter((ref:any)=>viewFields.includes(ref.path?.[0]));
 const hydrated=await hydrateNativeDocument(data);
 const [sender,receiver]=await Promise.all([person(raw.sender),person(raw.receiver)]);
 let replyTo=null;
 if(typeof raw.replyTo==='string'&&/^[a-f0-9]{24}$/.test(raw.replyTo)){
  const reply=await db.collection('messages').doc(raw.replyTo).get();
  if(reply.exists&&!reply.get('deletedAt')&&samePair(reply.data()!,raw.sender,raw.receiver)){
   const body=await hydrateNativeDocument(reply.data()!);
   replyTo={_id:reply.id,content:body.content,type:body.type,attachments:body.attachments||[],createdAt:body.createdAt,sender:await person(body.sender)};
  }
 }
 return nativeJson({...hydrated,_id:id,sender,receiver,replyTo}) as DocumentData;
}
export function canSendNativeMessage(sender:DocumentData, recipient:DocumentData, senderId:string, recipientId:string) {
 if(!sender||!recipient||['inactive','suspended','deleted'].includes(sender.status)||['inactive','suspended','deleted'].includes(recipient.status)||sender.isDeleted||recipient.isDeleted)return false;
 const role=sender.role,target=recipient.role;
 if(!['admin','dietitian','health_counselor','client'].includes(role)||!['admin','dietitian','health_counselor','client'].includes(target))return false;
 if(role==='admin')return true;
 if(role==='client')return sender.assignedDietitian===recipientId;
 if(target!=='client')return true;
 const primary=role==='dietitian'?'assignedDietitian':'assignedHealthCounselor';
 const secondary=role==='dietitian'?'assignedDietitians':'assignedHealthCounselors';
 return recipient[primary]===senderId||(recipient[secondary]||[]).includes(senderId);
}
export async function assertNativeMessagePeer(db:Firestore,userId:string,peer:string) {
 if(!idSchema.safeParse(userId).success||!idSchema.safeParse(peer).success)throw new NativeMessageError('Invalid conversation user ID',400);
 const [sender,recipient]=await db.getAll(db.collection('users').doc(userId),db.collection('users').doc(peer));
 if(!canSendNativeMessage(sender.data()!,recipient.data()!,userId,peer))throw new NativeMessageError('You cannot message this user',403);
 return {sender:sender.data()!,recipient:recipient.data()!};
}
export async function listNativeClientMessages(db:Firestore,userId:string,peer:string|null,page:number,limit:number,staffMode=false){
 if(peer){
  if(!idSchema.safeParse(peer).success)throw new NativeMessageError('Invalid conversation user ID',400);
  const user=await db.collection('users').doc(userId).get();
  if(!staffMode&&user.get('assignedDietitian')!==peer)throw new NativeMessageError('You can only message your primary dietitian',403);
 }
 const base=db.collection('messages').where(peer?pair(userId,peer):Filter.or(Filter.where('sender','==',userId),Filter.where('receiver','==',userId)));
 const [all,deleted]=await Promise.all([base.count().get(),base.where('deletedAt','>=',new Date(0)).count().get()]);
 const total=Math.max(0,all.data().count-deleted.data().count);
 const query=base.orderBy('createdAt','desc').orderBy(FieldPath.documentId(),'desc');
 let cursor:FirebaseFirestore.QueryDocumentSnapshot|undefined,skip=(page-1)*limit;
 const selected:FirebaseFirestore.QueryDocumentSnapshot[]=[];
 while(selected.length<limit){
  const rows=await (cursor?query.startAfter(cursor):query).limit(Math.min(200,Math.max(limit,50))).get();
  if(rows.empty)break;
  for(const row of rows.docs){if(row.get('deletedAt'))continue;if(skip>0){skip--;continue;}selected.push(row);if(selected.length===limit)break;}
  if(rows.size<Math.min(200,Math.max(limit,50)))break;cursor=rows.docs.at(-1);
 }
 if(peer){
  const unread=selected.filter(row=>row.get('receiver')===userId&&!row.get('isRead'));
  if(unread.length)await db.runTransaction(async tx=>{
   const fresh=await tx.getAll(...unread.map(row=>row.ref));
   for(const row of fresh)if(row.exists&&!row.get('deletedAt')&&!row.get('isRead')&&row.get('receiver')===userId)tx.update(row.ref,{isRead:true,readAt:new Date()});
  });
 }
 const people=new Map<string,Promise<Awaited<ReturnType<typeof publicPerson>>>>();
 const messages=await Promise.all(selected.reverse().map(row=>nativeMessageView(db,row.id,{...row.data(),...(peer&&row.get('receiver')===userId?{isRead:true}:{})},people)));
 return {messages,total,pagination:{page,limit,total,pages:Math.ceil(total/limit),hasMore:page*limit<total}};
}
export async function sendNativeClientMessage(db:Firestore,userId:string,input:unknown,operationKey?:string|null,staffMode=false){
 const parsed=inputSchema.safeParse(input);if(!parsed.success)throw new NativeMessageError('Invalid message or attachment',400);
 const data=parsed.data,hash=createHash('sha256').update(JSON.stringify(data)).digest('hex');
 const key=operationKey&&/^[a-zA-Z0-9._:-]{8,128}$/.test(operationKey)?operationKey:randomBytes(16).toString('hex');
 const id=createHash('sha256').update(userId+'\0'+key).digest('hex').slice(0,24),ref=db.collection('messages').doc(id);
 const now=new Date(),message={...data,_id:id,sender:userId,receiver:data.recipientId,status:'sent',isRead:false,reactions:[],isForwarded:false,createdAt:now,updatedAt:now,_nativeOperationHash:hash};
 delete (message as any).recipientId;
 // Attachment metadata is normalized only after ownership is checked in the transaction.
 const result=await db.runTransaction(async tx=>{
  const [user,recipient,current]=await tx.getAll(db.collection('users').doc(userId),db.collection('users').doc(data.recipientId),ref);
  if(!canSendNativeMessage(user.data()!,recipient.data()!,userId,data.recipientId)||(!staffMode&&(user.get('role')!=='client'||user.get('assignedDietitian')!==data.recipientId)))throw new NativeMessageError('You can only message your primary dietitian',403);
  if(!recipient.exists)throw new NativeMessageError('Recipient not found',404);
  if(current.exists){if(current.get('_nativeOperationHash')!==hash||current.get('deletedAt'))throw new NativeMessageError('Message retry conflicts with an existing operation',409);return {created:false,data:current.data()!};}
  if(data.replyTo){const reply=await tx.get(db.collection('messages').doc(data.replyTo));if(!reply.exists||reply.get('deletedAt')||!samePair(reply.data()!,userId,data.recipientId))throw new NativeMessageError('The message you are replying to is unavailable',400);}
  let source:DocumentData|undefined;
  if(data.forwardSourceId){const original=await tx.get(db.collection('messages').doc(data.forwardSourceId));if(!original.exists||original.get('deletedAt')||![original.get('sender'),original.get('receiver')].includes(userId))throw new NativeMessageError('Forwarded message is unavailable',403);source=await hydrateNativeDocument(original.data()!);}
  const attachments:DocumentData[]=[];
  for(const attachment of data.attachments){
   const routeId=/^\/api\/files\/([a-f0-9]{24})(?:\?.*)?$/.exec(attachment.url)?.[1];
   if(routeId&&attachment.fileId&&routeId!==attachment.fileId)throw new NativeMessageError('Attachment identity mismatch',400);
   const fileId=attachment.fileId||routeId;
   const original=(source?.attachments||[]).find((item:DocumentData)=>fileId?String(item.fileId||/^\/api\/files\/([a-f0-9]{24})/.exec(item.url||'')?.[1])===fileId:item.url===attachment.url);
   if(fileId){
    const file=await tx.get(db.collection('files').doc(fileId));
    if(!file.exists||file.get('deletedAt')||(file.get('uploadedBy')!==userId&&!original))throw new NativeMessageError('You cannot share this attachment',403);
    if(!routeId&&attachment.url!==file.get('imageKitUrl')&&attachment.url!==original?.url)throw new NativeMessageError('Attachment URL mismatch',400);
    attachments.push({...attachment,fileId,url:'/api/files/'+fileId,filename:file.get('originalName')||file.get('filename')||attachment.filename,size:file.get('size')||attachment.size,mimeType:file.get('mimeType')||attachment.mimeType,thumbnail:undefined});
   }else{
    // Legacy attachments may only be forwarded from a live message the sender participates in.
    if(!original||!(original.url.startsWith('https://')||/^\/api\/media\/[a-f0-9]{64}$/.test(original.url)))throw new NativeMessageError('Upload this attachment before sharing it',403);
    attachments.push({...original});
   }
  }
  const stored={...message,attachments:attachments.map(item=>Object.fromEntries(Object.entries(item).filter(([,value])=>value!==undefined))),isForwarded:!!source};delete (stored as any).forwardSourceId;
  const prepared=await prepareNativeDocument(stored);
  tx.set(db.collection('_nativeConversations').doc(createHash('sha256').update([userId,data.recipientId].sort().join('\0')).digest('hex')),{userIds:[userId,data.recipientId].sort(),lastMessageId:id,updatedAt:now});
  attachments.forEach((attachment,index)=>{
   const mediaHash=attachment.url.startsWith('https://')?createHash('sha256').update(new URL(attachment.url).href).digest('hex'):/^\/api\/media\/([a-f0-9]{64})$/.exec(attachment.url)?.[1];
   tx.create(db.collection('_nativeMessageMedia').doc(id+'-'+index),{messageId:id,participants:[userId,data.recipientId],...(attachment.fileId?{fileId:attachment.fileId}:{}),...(mediaHash?{urlHash:mediaHash}:{}),url:attachment.url,createdAt:now});
  });
  tx.create(ref,prepared);return {created:true,data:stored};
 });
 return {created:result.created,message:await nativeMessageView(db,id,result.data)};
}
export async function deleteNativeClientMessage(db:Firestore,userId:string,id:string){
 if(!idSchema.safeParse(id).success)throw new NativeMessageError('Invalid message ID',400);
 return db.runTransaction(async tx=>{
  const ref=db.collection('messages').doc(id),row=await tx.get(ref);
  if(!row.exists)throw new NativeMessageError('Message not found',404);
  if(row.get('sender')!==userId)throw new NativeMessageError('You can only delete your own messages',403);
  if(!row.get('deletedAt'))tx.update(ref,{deletedAt:new Date(),updatedAt:new Date()});
  return {receiver:row.get('receiver')};
 });
}
