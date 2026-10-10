import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/database';
import {NativeDirectoryError} from '@/lib/db/repository/native-client-directory';
import {resolveNativeProfessional,readNativeProfessionalDetail} from '@/lib/db/repository/native-admin-professional-detail';
import {updateNativeUser,deleteNativeUser} from '@/lib/db/repository/native-user-admin';
type Context={params:Promise<{counselorId:string}>};
const counselorOnly=true;
async function handle(r:NextRequest,c:Context,method:string){try{const session=await getServerSession(authOptions);if(!session?.user)return nativeResponseJson({error:'Unauthorized'},{status:401});const db=getNativeDatabase(),identifier=(await c.params).counselorId;
 if(method==='GET')return nativeResponseJson(await readNativeProfessionalDetail(db,session.user.id,identifier,counselorOnly));const professional=await resolveNativeProfessional(db,session.user.id,identifier,counselorOnly),key=counselorOnly?'counselor':'dietitian';
 if(method==='DELETE'&&r.nextUrl.searchParams.get('action')==='delete')return nativeResponseJson(await deleteNativeUser(db,session.user.id,professional._id,professional.role));
 const body=method==='DELETE'?{status:'inactive'}:await r.json();delete body.role;delete body.password;delete body._id;const updated=await updateNativeUser(db,session.user.id,professional._id,body,{adminOnly:true,role:professional.role});return nativeResponseJson({[key]:updated,message:method==='DELETE'?'Professional deactivated successfully':'Professional updated successfully'});
 }catch(e){return nativeResponseJson({error:e instanceof NativeDirectoryError?e.message:'Unable to process professional'},{status:e instanceof NativeDirectoryError?e.status:500});}}
export const GET=(r:NextRequest,c:Context)=>handle(r,c,'GET');
export const PUT=(r:NextRequest,c:Context)=>handle(r,c,'PUT');
export const DELETE=(r:NextRequest,c:Context)=>handle(r,c,'DELETE');
