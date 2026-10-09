import {nativeResponseJson} from '@/lib/api/native-response';
import {nativeMediaJson} from '@/lib/api/native-media-json';
import {NextRequest,NextResponse,after} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {listNativeClientMessages,sendNativeClientMessage,NativeMessageError} from '@/lib/db/repository/native-messages';
import {socketManager} from '@/lib/realtime/socket-manager';
import {notifyMessageToRecipient} from '@/lib/notifications/staffPushService';

export async function GET(request:NextRequest){
 try{
  const session=await getServerSession(authOptions);if(!session?.user?.id)return nativeResponseJson({error:'Unauthorized'},{status:401});
  const params=request.nextUrl.searchParams;
  const limit=Math.min(200,Math.max(1,parseInt(params.get('limit')||'120',10)||120));
  const page=Math.min(10000,Math.max(1,parseInt(params.get('page')||'1',10)||1));
  return nativeResponseJson(await nativeMediaJson(getNativeDatabase(),await listNativeClientMessages(getNativeDatabase(),session.user.id,params.get('conversationWith'),page,limit)));
 }catch(error){return nativeResponseJson({error:error instanceof NativeMessageError?error.message:'Failed to fetch messages'},{status:error instanceof NativeMessageError?error.status:503});}
}
export async function POST(request:NextRequest){
 try{
  const session=await getServerSession(authOptions);if(!session?.user?.id)return nativeResponseJson({error:'Unauthorized'},{status:401});
  const result=await sendNativeClientMessage(getNativeDatabase(),session.user.id,await request.json(),request.headers.get('x-idempotency-key'));
  // Local acceptance tests never contact real recipients or the production socket server.
  if(result.created&&process.env.NODE_ENV==='production')after(async()=>{
   const message=result.message,recipient=message.receiver,sender=message.sender;
   await Promise.allSettled([
    ...[[recipient._id,sender._id],[sender._id,recipient._id]].map(([userId,peer])=>socketManager.sendToUser(userId,'new_message',{message,conversationWith:peer,timestamp:Date.now()})),
    notifyMessageToRecipient({recipientId:recipient._id,recipientRole:recipient.role,senderName:`${sender.firstName||''} ${sender.lastName||''}`.trim(),senderRole:'client',messagePreview:message.content,messageId:message._id,conversationWithUserId:sender._id,clientId:sender._id})
   ]);
  });
  return nativeResponseJson(await nativeMediaJson(getNativeDatabase(),{success:true,message:result.message}));
 }catch(error){return nativeResponseJson({error:error instanceof NativeMessageError?error.message:'Failed to send message'},{status:error instanceof NativeMessageError?error.status:503});}
}

// Retained for existing internal consumers while their conversation route migrates.
export async function getConversations(userId:string){
 const {nativeClientConversation}=await import('@/lib/db/repository/native-conversation');
 const conversation=await nativeClientConversation(getNativeDatabase(),userId);
 return conversation?[conversation]:[];
}
