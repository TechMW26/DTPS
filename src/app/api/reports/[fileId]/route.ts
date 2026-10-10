import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/database';
import {lookupNativeReport,deleteNativeReport,NativeReportError} from '@/lib/db/repository/native-reports';
import {nativeMediaResponse} from '@/lib/api/native-media-response';
type Context={params:Promise<{fileId:string}>};
function failure(error:unknown){return nativeResponseJson({error:error instanceof NativeReportError?error.message:'Report service temporarily unavailable'},{status:error instanceof NativeReportError?error.status:503});}
export async function GET(_req:NextRequest,{params}:Context){try{const session=await getServerSession(authOptions);if(!session?.user?.id)return nativeResponseJson({error:'Unauthorized'},{status:401});return await nativeMediaResponse(await lookupNativeReport(getNativeDatabase(),(await params).fileId,{id:session.user.id,role:session.user.role}),_req);}catch(error){return failure(error);}}
export async function DELETE(_req:NextRequest,{params}:Context){try{const session=await getServerSession(authOptions);if(!session?.user?.id)return nativeResponseJson({error:'Unauthorized'},{status:401});await deleteNativeReport(getNativeDatabase(),(await params).fileId,{id:session.user.id,role:session.user.role});return nativeResponseJson({success:true,message:'File deleted successfully'});}catch(error){return failure(error);}}
