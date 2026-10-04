import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {processNativeClientErasure} from '@/lib/db/repository/native-admin-client-erasure';
import {NativeDirectoryError} from '@/lib/db/repository/native-client-directory';
export async function POST(r:NextRequest,c:{params:Promise<{clientId:string}>}){try{const session=await getServerSession(authOptions);if(!session?.user)return nativeResponseJson({error:'Unauthorized'},{status:401});return nativeResponseJson(await processNativeClientErasure(getNativeDatabase(),session.user.id,(await c.params).clientId));}catch(e){return nativeResponseJson({error:e instanceof NativeDirectoryError?e.message:'Unable to process erasure'},{status:e instanceof NativeDirectoryError?e.status:500});}}
