import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {deleteNativeClientMessage,NativeMessageError} from '@/lib/db/repository/native-messages';
import {socketManager} from '@/lib/realtime/socket-manager';
export async function DELETE(request:NextRequest,{params}:{params:Promise<{messageId:string}>}){
 const session=await getServerSession(authOptions);if(!session?.user?.id)return nativeResponseJson({error:'Unauthorized'},{status:401});
 try{
  const {messageId}=await params,result=await deleteNativeClientMessage(getNativeDatabase(),session.user.id,messageId);
  await socketManager.sendToUsers([session.user.id,result.receiver],'message_deleted',{messageId,deletedBy:session.user.id,timestamp:Date.now()});
  return nativeResponseJson({success:true,message:'Message deleted successfully'});
 }catch(e){return nativeResponseJson({error:e instanceof NativeMessageError?e.message:'Message deletion failed'},{status:e instanceof NativeMessageError?e.status:503});}
}
