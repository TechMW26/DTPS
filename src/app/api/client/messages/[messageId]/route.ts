import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {deleteNativeClientMessage,NativeMessageError} from '@/lib/db/repository/native-messages';
import {socketManager} from '@/lib/realtime/socket-manager';
export async function DELETE(_request:NextRequest,{params}:{params:Promise<{messageId:string}>}){
 try{
  const session=await getServerSession(authOptions);if(!session?.user?.id)return nativeResponseJson({error:'Unauthorized'},{status:401});
  const {messageId}=await params,result=await deleteNativeClientMessage(getNativeDatabase(),session.user.id,messageId);
  if(process.env.NODE_ENV==='production')for(const [userId,peer] of [[session.user.id,result.receiver],[result.receiver,session.user.id]])socketManager.sendToUser(userId,'message_deleted',{messageId,conversationWith:peer,timestamp:Date.now()});
  return nativeResponseJson({success:true,message:'Message deleted successfully'});
 }catch(error){return nativeResponseJson({error:error instanceof NativeMessageError?error.message:'Failed to delete message'},{status:error instanceof NativeMessageError?error.status:503});}
}
