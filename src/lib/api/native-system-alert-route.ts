import {NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {assertNativeAlertAdmin,NativeAlertError} from '@/lib/db/repository/native-system-alerts';
import {z} from 'zod';
export async function nativeAlertRoute(operation:(db:ReturnType<typeof getNativeDatabase>,id:string)=>Promise<unknown>){
 try{
  const session=await getServerSession(authOptions);if(!session?.user?.id)return NextResponse.json({error:'Unauthorized'},{status:401});
  const db=getNativeDatabase();await assertNativeAlertAdmin(db,session.user.id);return NextResponse.json(await operation(db,session.user.id));
 }catch(e){return NextResponse.json({error:e instanceof NativeAlertError?e.message:e instanceof z.ZodError?'Invalid alert input':'System alert operation failed'},{status:e instanceof NativeAlertError?e.status:e instanceof z.ZodError?400:503});}
}
