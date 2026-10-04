import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {z} from 'zod';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {NativeStaffClientError} from '@/lib/db/repository/native-staff-client';
import {nativeStaffRecall} from '@/lib/db/repository/native-staff-recall';
export const dynamic='force-dynamic';
type Context={params:Promise<{clientId:string}>};
async function run(req:NextRequest,{params}:Context,write:boolean){try{const session=await getServerSession(authOptions);if(!session?.user?.id)return nativeResponseJson({error:'Unauthorized'},{status:401});const {clientId}=await params;return nativeResponseJson(await nativeStaffRecall(getNativeDatabase(),session.user.id,clientId,write?await req.json():undefined));}catch(e){return nativeResponseJson({error:e instanceof NativeStaffClientError?e.message:'Unable to process dietary recall'},{status:e instanceof NativeStaffClientError?e.status:e instanceof z.ZodError||e instanceof SyntaxError?400:500});}}
export const GET=(req:NextRequest,ctx:Context)=>run(req,ctx,false);
export const PUT=(req:NextRequest,ctx:Context)=>run(req,ctx,true);
