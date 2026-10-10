import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/database';
import {NativeDirectoryError} from '@/lib/db/repository/native-client-directory';
import {readNativeAdminUserActivity} from '@/lib/db/repository/native-admin-audit';
export async function GET(r:NextRequest,c:{params:Promise<{id:string}>}){try{const session=await getServerSession(authOptions);if(!session?.user)return nativeResponseJson({error:'Unauthorized'},{status:401});return nativeResponseJson(await readNativeAdminUserActivity(getNativeDatabase(),session.user.id,(await c.params).id));}catch(e){return nativeResponseJson({error:e instanceof NativeDirectoryError?e.message:'Unable to fetch activity'},{status:e instanceof NativeDirectoryError?e.status:500});}}
