import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {z} from 'zod';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {NativeStaffClientError} from './native-staff-client';
import {readStaffTasks,mutateStaffTask} from './native-staff-tasks';
type Context={params:Promise<{clientId:string;taskId?:string}>};
export function nativeStaffTaskHandlers(){async function run(req:NextRequest,{params}:Context,write=false,remove=false){try{const session=await getServerSession(authOptions);if(!session?.user?.id)throw new NativeStaffClientError('Unauthorized',401);const {clientId,taskId}=await params,db=getNativeDatabase();if(!write)return nativeResponseJson({success:true,...await readStaffTasks(db,session.user.id,clientId,req.nextUrl.searchParams,taskId)});const task=await mutateStaffTask(db,session.user.id,clientId,remove?{}:await req.json(),taskId,remove);return nativeResponseJson({success:true,...(!remove?{task}:{}),message:remove?'Task deleted successfully':taskId?'Task updated successfully':'Task created successfully'},{status:!taskId?201:200});}catch(e){return nativeResponseJson({error:e instanceof NativeStaffClientError?e.message:'Unable to process task'},{status:e instanceof NativeStaffClientError?e.status:e instanceof z.ZodError||e instanceof SyntaxError?400:500});}}return {GET:(r:NextRequest,c:Context)=>run(r,c),POST:(r:NextRequest,c:Context)=>run(r,c,true),PUT:(r:NextRequest,c:Context)=>run(r,c,true),DELETE:(r:NextRequest,c:Context)=>run(r,c,true,true)};}
