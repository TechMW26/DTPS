import {nativeResponseJson} from '@/lib/api/native-response';
import {getServerSession} from 'next-auth';
import {NextResponse} from 'next/server';
import {authOptions} from '@/lib/auth';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {nativeClientConversation} from '@/lib/db/repository/native-conversation';
export async function GET(){
 try{
  const session=await getServerSession(authOptions);
  if(!session?.user?.id)return nativeResponseJson({error:'Unauthorized'},{status:401});
  const conversation=await nativeClientConversation(getNativeDatabase(),session.user.id);
  return nativeResponseJson({conversations:conversation?[conversation]:[],hasDietitian:!!conversation});
 }catch{return nativeResponseJson({error:'Failed to fetch conversations'},{status:500});}
}
