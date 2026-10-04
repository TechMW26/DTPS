import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {nativeCommercePasswordStatus,migrateNativeCommercePasswords} from '@/lib/db/repository/native-admin-password-migration';
import {NativeDirectoryError} from '@/lib/db/repository/native-client-directory';
async function handle(request:NextRequest,write:boolean){try{const session=await getServerSession(authOptions);if(!session?.user)return nativeResponseJson({error:'Unauthorized'},{status:401});return nativeResponseJson(write?await migrateNativeCommercePasswords(getNativeDatabase(),session.user.id,request.nextUrl.searchParams.get('cursor')||undefined):await nativeCommercePasswordStatus(getNativeDatabase(),session.user.id));}catch(e){return nativeResponseJson({error:e instanceof NativeDirectoryError?e.message:'Unable to process password migration'},{status:e instanceof NativeDirectoryError?e.status:500});}}
export const GET=(request:NextRequest)=>handle(request,false);
export const POST=(request:NextRequest)=>handle(request,true);
