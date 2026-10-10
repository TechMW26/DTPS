import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/database';
import {listNativeAdminClients,NativeDirectoryError} from '@/lib/db/repository/native-client-directory';
export async function GET(request:NextRequest){try{const session=await getServerSession(authOptions);if(!session?.user)return nativeResponseJson({error:'Unauthorized'},{status:401});if(session.user.role!=='admin')return nativeResponseJson({error:'Admin access required'},{status:403});return nativeResponseJson(await listNativeAdminClients(getNativeDatabase(),request.nextUrl.searchParams),{headers:{'Cache-Control':'private, no-store'}});}catch(error){return nativeResponseJson({error:error instanceof NativeDirectoryError?error.message:'Unable to load clients'},{status:error instanceof NativeDirectoryError?error.status:500});}}
