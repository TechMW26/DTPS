import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {z} from 'zod';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/database';
import {NativeStaffClientError} from '@/lib/db/repository/native-staff-client';
import {NativeHabitError} from '@/lib/db/repository/native-habits';
import {readStaffActivityAssignments,mutateStaffActivityAssignment} from '@/lib/db/repository/native-staff-activity-assignments';
async function handle(req:NextRequest,method:'GET'|'POST'|'PUT'|'DELETE'){try{const session=await getServerSession(authOptions);if(!session?.user?.id)throw new NativeStaffClientError('Unauthorized',401);const db=getNativeDatabase();return nativeResponseJson(method==='GET'?await readStaffActivityAssignments(db,session.user.id,req.nextUrl.searchParams):await mutateStaffActivityAssignment(db,session.user.id,method,method==='DELETE'?Object.fromEntries(req.nextUrl.searchParams):await req.json(),req.headers.get('idempotency-key')));}catch(e){return nativeResponseJson({error:e instanceof NativeStaffClientError||e instanceof NativeHabitError?e.message:e instanceof z.ZodError?'Invalid assignment fields':'Unable to process assignment'},{status:e instanceof NativeStaffClientError||e instanceof NativeHabitError?e.status:e instanceof z.ZodError||e instanceof SyntaxError?400:500});}}
export const GET=(req:NextRequest)=>handle(req,'GET');
export const POST=(req:NextRequest)=>handle(req,'POST');
export const PUT=(req:NextRequest)=>handle(req,'PUT');
export const DELETE=(req:NextRequest)=>handle(req,'DELETE');
