import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/database';
import {readNativeUser,updateNativeUser,deleteNativeUser} from '@/lib/db/repository/native-user-admin';
import {attachNativeUserDocument} from '@/lib/db/repository/native-user-documents';
import {NativeDirectoryError} from '@/lib/db/repository/native-client-directory';
type Context={params:Promise<{id:string}>};
async function handle(r:NextRequest,c:Context,method:string){try{const session=await getServerSession(authOptions);if(!session?.user)return nativeResponseJson({error:'Unauthorized'},{status:401});const {id}=await c.params;if(!/^[a-f0-9]{24}$/i.test(id))throw new NativeDirectoryError('Invalid user ID');const db=getNativeDatabase();if(method==='GET')return nativeResponseJson({user:await readNativeUser(db,session.user.id,id)});if(method==='DELETE')return nativeResponseJson(await deleteNativeUser(db,session.user.id,id));let body=await r.json();if(method==='POST')return nativeResponseJson({documents:await attachNativeUserDocument(db,session.user.id,id,body),message:'Document uploaded successfully'});if(method==='PATCH'){if(!['active','inactive'].includes(body.status))throw new NativeDirectoryError('Invalid status');body={status:body.status};}return nativeResponseJson({user:await updateNativeUser(db,session.user.id,id,body),message:'User updated successfully'});}catch(e){return nativeResponseJson({error:e instanceof NativeDirectoryError?e.message:'Unable to process user'},{status:e instanceof NativeDirectoryError?e.status:500});}}
export const GET=(r:NextRequest,c:Context)=>handle(r,c,'GET');
export const PUT=(r:NextRequest,c:Context)=>handle(r,c,'PUT');
export const PATCH=(r:NextRequest,c:Context)=>handle(r,c,'PATCH');
export const DELETE=(r:NextRequest,c:Context)=>handle(r,c,'DELETE');
export const POST=(r:NextRequest,c:Context)=>handle(r,c,'POST');
