import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/database';
import {adminResetNativePassword,NativeAccountError} from '@/lib/db/repository/native-account';
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 try{const session=await getServerSession(authOptions);if(session?.user?.role!=='admin')throw new NativeAccountError('Admin access required',403);const {newPassword}=await req.json(),user=await adminResetNativePassword(getNativeDatabase(),session.user.id,(await params).id,newPassword);return nativeResponseJson({success:true,message:`Password changed successfully for ${user.name}`});}
 catch(error){return nativeResponseJson({error:error instanceof NativeAccountError?error.message:'Unable to reset password'},{status:error instanceof NativeAccountError?error.status:error instanceof SyntaxError?400:500});}
}
