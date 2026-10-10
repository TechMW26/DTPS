import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/database';
import {readNativeLeads,writeNativeLead} from '@/lib/db/repository/native-admin-leads';
import {NativeDirectoryError} from '@/lib/db/repository/native-client-directory';
async function handle(r:NextRequest,write:boolean){try{const session=await getServerSession(authOptions);if(!session?.user)return nativeResponseJson({error:'Unauthorized'},{status:401});return nativeResponseJson(write?await writeNativeLead(getNativeDatabase(),await r.json(),session.user.id):await readNativeLeads(getNativeDatabase(),session.user.id,r.nextUrl.searchParams));}catch(e){return nativeResponseJson({error:e instanceof NativeDirectoryError?e.message:'Unable to process leads'},{status:e instanceof NativeDirectoryError?e.status:500});}}
export const GET=(r:NextRequest)=>handle(r,false);
export const POST=(r:NextRequest)=>handle(r,true);
