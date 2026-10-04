import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {readNativeAdminClientDetail,removeNativeAdminClient,updateNativeClientProfile} from '@/lib/db/repository/native-admin-client-detail';
import {NativeDirectoryError} from '@/lib/db/repository/native-client-directory';
type Context={params:Promise<{clientId:string}>};
async function handle(r:NextRequest,c:Context,method:string){try{const session=await getServerSession(authOptions);if(!session?.user)return nativeResponseJson({error:'Unauthorized'},{status:401});const {clientId}=await c.params;if(!/^[a-f0-9]{24}$/i.test(clientId))throw new NativeDirectoryError('Invalid client ID');const db=getNativeDatabase();if(method==='GET')return nativeResponseJson(await readNativeAdminClientDetail(db,session.user.id,clientId));if(method==='PUT')return nativeResponseJson({client:await updateNativeClientProfile(db,session.user.id,clientId,await r.json(),false),message:'Client updated successfully'});const action=r.nextUrl.searchParams.get('action')||'deactivate';if(!['delete','deactivate'].includes(action))throw new NativeDirectoryError('Invalid action');return nativeResponseJson(await removeNativeAdminClient(db,session.user.id,clientId,action==='delete'));}catch(e){return nativeResponseJson({error:e instanceof NativeDirectoryError?e.message:'Unable to process client'},{status:e instanceof NativeDirectoryError?e.status:500});}}
export const GET=(r:NextRequest,c:Context)=>handle(r,c,'GET');
export const PUT=(r:NextRequest,c:Context)=>handle(r,c,'PUT');
export const DELETE=(r:NextRequest,c:Context)=>handle(r,c,'DELETE');
