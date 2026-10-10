import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/database';
import {requestNativeClientErasure} from '@/lib/db/repository/native-admin-client-erasure';
import {NativeDirectoryError} from '@/lib/db/repository/native-client-directory';
export async function DELETE(r:NextRequest){try{const session=await getServerSession(authOptions);if(!session?.user)return nativeResponseJson({error:'Unauthorized'},{status:401});return nativeResponseJson(await requestNativeClientErasure(getNativeDatabase(),session.user.id,(await r.json()).password));}catch(e){return nativeResponseJson({error:e instanceof NativeDirectoryError?e.message:'Unable to delete account'},{status:e instanceof NativeDirectoryError?e.status:500});}}
