import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/database';
import {nativePresence,touchNativePresence} from '@/lib/realtime/native-presence';
import {nativeRealtimeActor} from '@/lib/realtime/native-events';
export async function GET(request:NextRequest){
 const session=await getServerSession(authOptions);if(!session?.user?.id)return nativeResponseJson({error:'Unauthorized'},{status:401});
 try{return nativeResponseJson(await nativePresence(getNativeDatabase(),session.user.id,request.nextUrl.searchParams.get('userIds')?.split(',').filter(Boolean)||[],request.nextUrl.searchParams.get('checkTyping')==='true'),{headers:{'Cache-Control':'no-store'}});}
 catch{return nativeResponseJson({error:'Unable to fetch presence'},{status:400});}
}
export async function POST(request:NextRequest){
 const session=await getServerSession(authOptions);if(!session?.user?.id)return nativeResponseJson({error:'Unauthorized'},{status:401});
 try{
  const body=await request.json().catch(()=>({action:'heartbeat'}));
  if(!['heartbeat','away','back'].includes(body.action||'heartbeat'))return nativeResponseJson({error:'Invalid action'},{status:400});
  const db=getNativeDatabase();if(!await nativeRealtimeActor(db,session.user.id))return nativeResponseJson({error:'Forbidden'},{status:403});
  await touchNativePresence(db,session.user.id);return nativeResponseJson({success:true,timestamp:Date.now()});
 }catch{return nativeResponseJson({error:'Unable to update presence'},{status:503});}
}
