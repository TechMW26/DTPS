import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/database';
import {assignNativeClient} from '@/lib/db/repository/native-client-assignment';
import {NativeDirectoryError} from '@/lib/db/repository/native-client-directory';
export async function PATCH(r:NextRequest,c:{params:Promise<{clientId:string}>}){try{const session=await getServerSession(authOptions);if(!session?.user)return nativeResponseJson({error:'Unauthorized'},{status:401});const body=await r.json();return nativeResponseJson(await assignNativeClient(getNativeDatabase(),session.user.id,(await c.params).clientId,{...body,action:body.mode||'add'},true));}catch(e){return nativeResponseJson({error:e instanceof NativeDirectoryError?e.message:'Unable to update assignment'},{status:e instanceof NativeDirectoryError?e.status:500});}}
export async function GET(r:NextRequest,c:{params:Promise<{clientId:string}>}){try{const session=await getServerSession(authOptions);if(!session?.user)return nativeResponseJson({error:'Unauthorized'},{status:401});const {nativeAssignmentOptions}=await import('@/lib/db/repository/native-client-assignment');return nativeResponseJson(await nativeAssignmentOptions(getNativeDatabase(),session.user.id,(await c.params).clientId));}catch(e){return nativeResponseJson({error:e instanceof NativeDirectoryError?e.message:'Unable to fetch assignment options'},{status:e instanceof NativeDirectoryError?e.status:500});}}
