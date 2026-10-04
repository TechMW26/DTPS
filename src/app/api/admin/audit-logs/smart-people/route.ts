import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {NativeDirectoryError} from '@/lib/db/repository/native-client-directory';
import {readNativeSmartAudit} from '@/lib/db/repository/native-admin-audit';
export async function GET(r:NextRequest){try{const session=await getServerSession(authOptions);if(!session?.user)return nativeResponseJson({error:'Unauthorized'},{status:401});return nativeResponseJson(await readNativeSmartAudit(getNativeDatabase(),session.user.id,r.nextUrl.searchParams));}catch(e){return nativeResponseJson({error:e instanceof NativeDirectoryError?e.message:'Unable to fetch audit logs'},{status:e instanceof NativeDirectoryError?e.status:500});}}
