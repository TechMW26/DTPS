import {nativeResponseJson} from '@/lib/api/native-response';
import {getServerSession} from 'next-auth';
import {NextResponse} from 'next/server';
import {authOptions} from '@/lib/auth';
import {getNativeDatabase} from '@/lib/db/database';
export async function GET(){
 try{
  const session=await getServerSession(authOptions);
  if(!session?.user?.id)return nativeResponseJson({error:'Unauthorized'},{status:401});
  const count=await getNativeDatabase().collection('messages').where('receiver','==',session.user.id).where('isRead','==',false).count().get();
  return nativeResponseJson({count:count.data().count});
 }catch{return nativeResponseJson({error:'Failed to fetch unread count'},{status:503});}
}
