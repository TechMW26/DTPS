import {coalesceRead} from '@/lib/api/coalesce-read';
import {nativeResponseJson} from '@/lib/api/native-response';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { getNativeDatabase } from '@/lib/db/database';
import { nativeUnreadMessageCount } from '@/lib/db/repository/native-notifications';
import { socketManager } from '@/lib/realtime/socket-manager';
export async function POST(){
 const session=await getServerSession(authOptions);if(!session?.user?.id)return nativeResponseJson({error:'Unauthorized'},{status:401});
 try{
  const counts=await coalesceRead(`staff-unread:${session.user.id}`,async()=>{
   const result={messages:await nativeUnreadMessageCount(getNativeDatabase(),session.user.id)};
   await socketManager.sendToUser(session.user.id,'staff_unread_counts',result);
   return result;
  });
  return nativeResponseJson({success:true,messages:counts.messages},{headers:{'Cache-Control':'no-store'}});
 }catch{return nativeResponseJson({error:'Failed to refresh counts'},{status:503});}
}
