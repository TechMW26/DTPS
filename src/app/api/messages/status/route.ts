import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {updateNativeMessageStatus,nativeMessageStatus} from '@/lib/db/repository/native-message-status';
import {NativeMessageError} from '@/lib/db/repository/native-messages';
import {socketManager} from '@/lib/realtime/socket-manager';
const fail=(e:unknown)=>nativeResponseJson({error:e instanceof NativeMessageError?e.message:'Message status failed'},{status:e instanceof NativeMessageError?e.status:503});
export async function PUT(request:NextRequest){
 const session=await getServerSession(authOptions);if(!session?.user?.id)return nativeResponseJson({error:'Unauthorized'},{status:401});
 try{
  const input=await request.json(),result=await updateNativeMessageStatus(getNativeDatabase(),session.user.id,input);
  const peer=result.message?.sender?._id||input.conversationWith;
  if(peer)await socketManager.sendToUser(peer,input.messageId?'message_status_update':'conversation_read',{messageId:input.messageId||null,status:result.message?.status||input.status,readBy:session.user.id,timestamp:Date.now(),messagesCount:result.updatedCount});
  return nativeResponseJson(result);
 }catch(e){return fail(e);}
}
export async function GET(request:NextRequest){
 const session=await getServerSession(authOptions);if(!session?.user?.id)return nativeResponseJson({error:'Unauthorized'},{status:401});
 try{return nativeResponseJson(await nativeMessageStatus(getNativeDatabase(),session.user.id,request.nextUrl.searchParams.get('conversationWith')||''));}catch(e){return fail(e);}
}
