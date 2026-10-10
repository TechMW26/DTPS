import {nativeResponseJson} from '@/lib/api/native-response';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { getNativeDatabase } from '@/lib/db/database';
export async function GET(){
 try{
  const session=await getServerSession(authOptions);if(!session?.user?.id)return nativeResponseJson({error:'Unauthorized'},{status:401});
  const result=await getNativeDatabase().collection('notifications').where('userId','==',session.user.id).where('read','==',false).count().get();
  return nativeResponseJson({success:true,count:result.data().count});
 }catch{return nativeResponseJson({success:false,error:'Failed to fetch unread count'},{status:503});}
}
