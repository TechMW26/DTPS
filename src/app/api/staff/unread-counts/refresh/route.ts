import {nativeResponseJson} from '@/lib/api/native-response';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { getNativeDatabase } from '@/lib/db/firestore-native';
import { nativeUnreadCounts } from '@/lib/db/repository/native-notifications';
import { socketManager } from '@/lib/realtime/socket-manager';
export async function POST(){
 const session=await getServerSession(authOptions);if(!session?.user?.id)return nativeResponseJson({error:'Unauthorized'},{status:401});
 try{
  const counts=await nativeUnreadCounts(getNativeDatabase(),session.user.id);
  await socketManager.sendToUser(session.user.id,'staff_unread_counts',{messages:counts.messages});
  return nativeResponseJson({success:true,messages:counts.messages},{headers:{'Cache-Control':'no-store'}});
 }catch{return nativeResponseJson({error:'Failed to refresh counts'},{status:503});}
}
