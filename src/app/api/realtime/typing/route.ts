import {nativeResponseJson} from '@/lib/api/native-response';
import { NextRequest,NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { getNativeDatabase } from '@/lib/db/database';
import { assertNativeMessagePeer,NativeMessageError } from '@/lib/db/repository/native-messages';
import { socketManager } from '@/lib/realtime/socket-manager';
export async function POST(request:NextRequest){
 try{
  const session=await getServerSession(authOptions);if(!session?.user?.id)return nativeResponseJson({error:'Unauthorized'},{status:401});
  const {receiverId,isTyping}=await request.json();
  if(typeof isTyping!=='boolean')return nativeResponseJson({error:'Invalid typing state'},{status:400});
  const db=getNativeDatabase(),{sender}=await assertNativeMessagePeer(db,session.user.id,receiverId);
  await db.collection('_nativeTyping').doc(`${session.user.id}-${receiverId}`).set({userId:session.user.id,receiverId,isTyping,expiresAt:new Date(Date.now()+10_000)});
  await socketManager.sendToUser(receiverId,isTyping?'typing_start':'typing_stop',{userId:session.user.id,userName:`${sender.firstName||''} ${sender.lastName||''}`.trim(),userRole:sender.role,timestamp:Date.now()});
  return nativeResponseJson({success:true});
 }catch(e){return nativeResponseJson({error:e instanceof NativeMessageError?e.message:'Typing update failed'},{status:e instanceof NativeMessageError?e.status:503});}
}
