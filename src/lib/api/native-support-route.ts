import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/database';
import {createNativeSupport,listNativeSupport,updateNativeBugReport} from '@/lib/db/repository/native-support';
import {assertNativeAlertAdmin,NativeAlertError} from '@/lib/db/repository/native-system-alerts';
import {z} from 'zod';
const fail=(e:unknown)=>NextResponse.json({error:e instanceof NativeAlertError?e.message:e instanceof z.ZodError?'Invalid support form':'Support request failed'},{status:e instanceof NativeAlertError?e.status:e instanceof z.ZodError?400:503});
export function nativeSupportHandlers(kind:'contact'|'bug'){
 return {
 POST:async(request:NextRequest)=>{try{
  const session=await getServerSession(authOptions),result=await createNativeSupport(getNativeDatabase(),kind,await request.json(),session?.user?.id||null,session?.user?.email||null);
  return NextResponse.json({success:true,message:kind==='contact'?'Your message has been sent successfully':'Bug report submitted successfully',...(kind==='contact'?{ticketId:result.id}:{reportId:result.id,priority:result.priority})});
 }catch(e){return fail(e);}},
 GET:async(request:NextRequest)=>{try{
  const session=await getServerSession(authOptions);if(!session?.user?.id)return NextResponse.json({error:'Unauthorized'},{status:401});
  const db=getNativeDatabase();await assertNativeAlertAdmin(db,session.user.id);return NextResponse.json(await listNativeSupport(db,kind,request.nextUrl.searchParams));
 }catch(e){return fail(e);}},
 PATCH:async(request:NextRequest)=>{try{
  const session=await getServerSession(authOptions);if(!session?.user?.id)return NextResponse.json({error:'Unauthorized'},{status:401});
  return NextResponse.json({success:true,report:await updateNativeBugReport(getNativeDatabase(),session.user.id,await request.json())});
 }catch(e){return fail(e);}},
 };
}
