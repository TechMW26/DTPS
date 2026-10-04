import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {updateNativeMessageStatus} from '@/lib/db/repository/native-message-status';
import {NativeMessageError} from '@/lib/db/repository/native-messages';
import {socketManager} from '@/lib/realtime/socket-manager';
export async function PUT(request:NextRequest,{params}:{params:Promise<{messageId:string}>}){
 const session=await getServerSession(authOptions);if(!session?.user?.id)return nativeResponseJson({error:'Unauthorized'},{status:401});
 try{
  const {messageId}=await params,{status}=await request.json();if(!['read','delivered'].includes(status))throw new NativeMessageError('Invalid status',400);
  const result=await updateNativeMessageStatus(getNativeDatabase(),session.user.id,{messageId,status});
  await socketManager.sendToUser(result.message!.sender._id,'message_status_update',{messageId,status:result.message!.status,timestamp:Date.now()});
  return nativeResponseJson(result.message);
 }catch(e){return nativeResponseJson({error:e instanceof NativeMessageError?e.message:'Message status failed'},{status:e instanceof NativeMessageError?e.status:503});}
}
export {PUT as PATCH} from '../../status/route';
