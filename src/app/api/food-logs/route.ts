import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {z} from 'zod';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {NativeStaffClientError} from '@/lib/db/repository/native-staff-client';
import {readStaffFoodLogs,createStaffFoodLog} from '@/lib/db/repository/native-staff-foodlogs';
async function handle(req:NextRequest,write=false){try{const session=await getServerSession(authOptions);if(!session?.user?.id)throw new NativeStaffClientError('Unauthorized',401);const db=getNativeDatabase();return nativeResponseJson(write?await createStaffFoodLog(db,session.user.id,await req.json(),req.headers.get('idempotency-key')):await readStaffFoodLogs(db,session.user.id,req.nextUrl.searchParams),{status:write?201:200});}catch(e){return nativeResponseJson({error:e instanceof NativeStaffClientError?e.message:e instanceof z.ZodError?'Invalid food details':'Unable to process food log'},{status:e instanceof NativeStaffClientError?e.status:e instanceof z.ZodError||e instanceof SyntaxError?400:500});}}
export const GET=(req:NextRequest)=>handle(req);
export const POST=(req:NextRequest)=>handle(req,true);
