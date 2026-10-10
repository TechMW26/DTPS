import {nativeResponseJson} from '@/lib/api/native-response';
import { NextRequest, NextResponse, after } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { getNativeDatabase } from '@/lib/db/database';
import { listNativeClientMessages,sendNativeClientMessage,NativeMessageError } from '@/lib/db/repository/native-messages';
import { nativeMediaJson } from '@/lib/api/native-media-json';
import { socketManager } from '@/lib/realtime/socket-manager';
import { notifyMessageToRecipient } from '@/lib/notifications/staffPushService';
const error=(e:unknown)=>nativeResponseJson({error:e instanceof NativeMessageError?e.message:'Message operation failed'},{status:e instanceof NativeMessageError?e.status:503});
export async function GET(request:NextRequest){
 try{
  const session=await getServerSession(authOptions);if(!session?.user?.id)return nativeResponseJson({error:'Unauthorized'},{status:401});
  const params=request.nextUrl.searchParams,db=getNativeDatabase();
  const page=Math.min(10000,Math.max(1,parseInt(params.get('page')||'1',10)||1));
  const limit=Math.min(200,Math.max(1,parseInt(params.get('limit')||'100',10)||100));
  const result=await listNativeClientMessages(db,session.user.id,params.get('conversationWith'),page,limit,true);
  return nativeResponseJson(await nativeMediaJson(db,result));
 }catch(e){return error(e);}
}
export async function POST(request:NextRequest){
 try{
  const session=await getServerSession(authOptions);if(!session?.user?.id)return nativeResponseJson({error:'Unauthorized'},{status:401});
  const db=getNativeDatabase(),result=await sendNativeClientMessage(db,session.user.id,await request.json(),request.headers.get('x-idempotency-key'),true);
  if(result.created){
   const message=result.message,recipient=message.receiver,sender=message.sender;
   await Promise.allSettled([[recipient._id,sender._id],[sender._id,recipient._id]].map(([userId,peer])=>socketManager.sendToUser(userId,'new_message',{message,conversationWith:peer,timestamp:Date.now()})));
   if(process.env.NODE_ENV==='production')after(()=>notifyMessageToRecipient({recipientId:recipient._id,recipientRole:recipient.role,senderName:`${sender.firstName||''} ${sender.lastName||''}`.trim(),senderRole:sender.role,messagePreview:message.content,messageId:message._id,conversationWithUserId:sender._id,clientId:sender.role==='client'?sender._id:recipient.role==='client'?recipient._id:undefined}));
  }
  return nativeResponseJson({message:await nativeMediaJson(db,result.message)},{status:result.created?201:200});
 }catch(e){return error(e);}
}
