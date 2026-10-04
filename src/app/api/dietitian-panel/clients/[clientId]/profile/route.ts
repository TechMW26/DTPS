import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {z} from 'zod';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {assignedNativeClient,staffClientView,updateStaffClient,NativeStaffClientError} from '@/lib/db/repository/native-staff-client';
export const dynamic='force-dynamic';
type Context={params:Promise<{clientId:string}>};
async function run(req:NextRequest,{params}:Context,write:boolean){try{const session=await getServerSession(authOptions);if(!session?.user?.id)return nativeResponseJson({error:'Unauthorized'},{status:401});const {clientId}=await params,db=getNativeDatabase();const data=write?await updateStaffClient(db,session.user.id,clientId,await req.json()):await staffClientView(db,clientId,(await assignedNativeClient(db,session.user.id,clientId)).client.data()!);return nativeResponseJson({success:true,data,...(write?{message:'Profile updated successfully'}:{})});}catch(e){return nativeResponseJson({error:e instanceof NativeStaffClientError?e.message:'Unable to process client profile'},{status:e instanceof NativeStaffClientError?e.status:e instanceof z.ZodError||e instanceof SyntaxError?400:500});}}
export const GET=(req:NextRequest,ctx:Context)=>run(req,ctx,false);
export const PUT=(req:NextRequest,ctx:Context)=>run(req,ctx,true);
