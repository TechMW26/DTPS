import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse,after} from 'next/server';
import {randomUUID} from 'node:crypto';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {sendNativeClientMessage,assertNativeMessagePeer,NativeMessageError} from '@/lib/db/repository/native-messages';
import {socketManager} from '@/lib/realtime/socket-manager';
import {notifyMessageToRecipient} from '@/lib/notifications/staffPushService';
export async function POST(request:NextRequest){
 const session=await getServerSession(authOptions);if(!session?.user?.id)return nativeResponseJson({error:'Unauthorized'},{status:401});
 if(!['admin','dietitian','health_counselor'].includes(session.user.role))return nativeResponseJson({error:'Bulk messaging is only available for staff'},{status:403});
 try{
  const body=await request.json(),ids=Array.isArray(body.recipientIds)?[...new Set(body.recipientIds as string[])]:[];
  if(!ids.length||ids.length>500||ids.some(id=>typeof id!=='string'||!/^[a-f0-9]{24}$/.test(id)))throw new NativeMessageError('Select between 1 and 500 recipients',400);
  const db=getNativeDatabase(),key=request.headers.get('x-idempotency-key')||randomUUID();
  if(!/^[a-zA-Z0-9._:-]{8,90}$/.test(key))throw new NativeMessageError('Invalid operation key',400);
  const results={totalRecipients:ids.length,sent:0,failed:0,skipped:0};
  for(let offset=0;offset<ids.length;offset+=10)await Promise.all(ids.slice(offset,offset+10).map(async recipientId=>{
   try{
    const {recipient}=await assertNativeMessagePeer(db,session.user.id,recipientId);
    if(recipient.role!=='client'){results.skipped++;return;}
    const result=await sendNativeClientMessage(db,session.user.id,{...body,recipientId},`${key}:${recipientId}`,true);
    if(result.created){
     await socketManager.sendToUser(recipientId,'new_message',{message:result.message,conversationWith:session.user.id,timestamp:Date.now()});
     if(process.env.NODE_ENV==='production')after(()=>notifyMessageToRecipient({recipientId,recipientRole:'client',senderName:`${session.user.firstName||''} ${session.user.lastName||''}`.trim(),senderRole:session.user.role,messagePreview:result.message.content,messageId:result.message._id,conversationWithUserId:session.user.id,clientId:recipientId}));
    }
    results.sent++;
   }catch(e){if(e instanceof NativeMessageError&&e.status===403)results.skipped++;else results.failed++;}
  }));
  return nativeResponseJson({success:results.failed===0,results},{status:201});
 }catch(e){return nativeResponseJson({error:e instanceof NativeMessageError?e.message:'Bulk messaging failed'},{status:e instanceof NativeMessageError?e.status:503});}
}
