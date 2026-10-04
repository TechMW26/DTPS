import {nativeResponseJson} from '@/lib/api/native-response';
import {getServerSession} from 'next-auth';
import {NextResponse} from 'next/server';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {nativeUnreadCounts} from '@/lib/db/repository/native-notifications';
import {broadcastUnreadCounts} from '@/lib/realtime/broadcast-counts';
export async function POST(){
 try{
  const session=await getServerSession(authOptions);
  if(!session?.user?.id)return nativeResponseJson({error:'Unauthorized'},{status:401});
  const counts=await nativeUnreadCounts(getNativeDatabase(),session.user.id);
  broadcastUnreadCounts(session.user.id,counts);
  return nativeResponseJson({success:true,...counts});
 }catch{return nativeResponseJson({error:'Failed to refresh counts'},{status:503});}
}
