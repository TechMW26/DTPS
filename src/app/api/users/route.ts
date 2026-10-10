import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/database';
import {listNativeUsers} from '@/lib/db/repository/native-user-directory';
import {createNativeStaffUser} from '@/lib/db/repository/native-admin-create-user';
import {updateNativeUser} from '@/lib/db/repository/native-user-admin';
import {NativeDirectoryError} from '@/lib/db/repository/native-client-directory';
async function handle(r:NextRequest,method:string){try{const session=await getServerSession(authOptions);if(!session?.user)return nativeResponseJson({error:'Unauthorized'},{status:401});const db=getNativeDatabase();const result=method==='GET'?await listNativeUsers(db,session.user.id,r.nextUrl.searchParams):method==='POST'?await createNativeStaffUser(db,session.user.id,await r.json()):await updateNativeUser(db,session.user.id,session.user.id,await r.json());return nativeResponseJson(result,{status:method==='POST'?201:200,headers:{'Cache-Control':'private, no-store'}});}catch(e){return nativeResponseJson({error:e instanceof NativeDirectoryError?e.message:'Unable to process users'},{status:e instanceof NativeDirectoryError?e.status:500});}}
export const GET=(r:NextRequest)=>handle(r,'GET');
export const POST=(r:NextRequest)=>handle(r,'POST');
export const PUT=(r:NextRequest)=>handle(r,'PUT');
