import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/database';
import {nativeDraft} from '@/lib/db/repository/native-staff-drafts';
import {NativeStaffClientError} from '@/lib/db/repository/native-staff-client';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store, no-cache, must-revalidate','X-App-Version':process.env.NEXT_PUBLIC_APP_VERSION||process.env.npm_package_version||'1.0.0'};
async function run(req:NextRequest,method:'GET'|'POST'|'DELETE'){try{const session=await getServerSession(authOptions);if(!session?.user?.id)throw new NativeStaffClientError('Unauthorized',401);const input=method==='POST'?await req.json():{type:req.nextUrl.searchParams.get('type'),id:req.nextUrl.searchParams.get('id')};return nativeResponseJson(await nativeDraft(getNativeDatabase(),session.user.id,input.type,input.id,method,input.data),{headers});}catch(e){return nativeResponseJson({error:e instanceof NativeStaffClientError?e.message:'Unable to process draft'},{status:e instanceof NativeStaffClientError?e.status:e instanceof SyntaxError?400:500,headers});}}
export const GET=(req:NextRequest)=>run(req,'GET');export const POST=(req:NextRequest)=>run(req,'POST');export const DELETE=(req:NextRequest)=>run(req,'DELETE');
