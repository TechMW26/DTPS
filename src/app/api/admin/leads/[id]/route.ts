import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/database';
import {readNativeLeads,writeNativeLead} from '@/lib/db/repository/native-admin-leads';
import {NativeDirectoryError} from '@/lib/db/repository/native-client-directory';
type Context={params:Promise<{id:string}>};
async function handle(r:NextRequest,c:Context,method:string){try{const session=await getServerSession(authOptions);if(!session?.user)return nativeResponseJson({error:'Unauthorized'},{status:401});const id=(await c.params).id;return nativeResponseJson(method==='GET'?await readNativeLeads(getNativeDatabase(),session.user.id,r.nextUrl.searchParams,id):await writeNativeLead(getNativeDatabase(),method==='DELETE'?{}:await r.json(),session.user.id,id,method==='DELETE'));}catch(e){return nativeResponseJson({error:e instanceof NativeDirectoryError?e.message:'Unable to process lead'},{status:e instanceof NativeDirectoryError?e.status:500});}}
export const GET=(r:NextRequest,c:Context)=>handle(r,c,'GET');
export const PUT=(r:NextRequest,c:Context)=>handle(r,c,'PUT');
export const DELETE=(r:NextRequest,c:Context)=>handle(r,c,'DELETE');
