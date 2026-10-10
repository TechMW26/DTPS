import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/database';
import {correctNativePlanDates} from '@/lib/db/repository/native-staff-plan-date-correction';
import {NativeStaffClientError} from '@/lib/db/repository/native-staff-client';
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 try{const session=await getServerSession(authOptions);if(!session?.user?.id)return nativeResponseJson({error:'Unauthorized'},{status:401});
 return nativeResponseJson(await correctNativePlanDates(getNativeDatabase(),session.user.id,(await params).id,await req.json()));
 }catch(e){return nativeResponseJson({error:e instanceof NativeStaffClientError?e.message:'Unable to correct plan dates'},{status:e instanceof NativeStaffClientError?e.status:e instanceof SyntaxError?400:500});}
}
