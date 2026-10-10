import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/database';
import {nativeAdminClientProfile,updateNativeClientProfile} from '@/lib/db/repository/native-admin-client-profile';
import {NativeDirectoryError} from '@/lib/db/repository/native-client-directory';
type Context={params:Promise<{clientId:string}>};
async function handle(request:NextRequest,context:Context,write=false){try{const session=await getServerSession(authOptions);if(!session?.user)return nativeResponseJson({error:'Unauthorized'},{status:401});if(session.user.role!=='admin')return nativeResponseJson({error:'Admin access required'},{status:403});const {clientId}=await context.params;if(!/^[a-f0-9]{24}$/i.test(clientId))throw new NativeDirectoryError('Invalid client ID');const db=getNativeDatabase();const data=write?await updateNativeClientProfile(db,session.user.id,clientId,await request.json()):await nativeAdminClientProfile(db,session.user.id,clientId);return nativeResponseJson({success:true,data,...(write?{message:'Profile updated successfully'}:{})});}catch(e){return nativeResponseJson({error:e instanceof NativeDirectoryError?e.message:'Unable to process client profile'},{status:e instanceof NativeDirectoryError?e.status:500});}}
export const GET=(r:NextRequest,c:Context)=>handle(r,c);
export const PUT=(r:NextRequest,c:Context)=>handle(r,c,true);
