import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/database';
import {assignNativeClient} from '@/lib/db/repository/native-client-assignment';
import {NativeDirectoryError} from '@/lib/db/repository/native-client-directory';
export async function PATCH(r:NextRequest,c:{params:Promise<{clientId:string}>}){try{const session=await getServerSession(authOptions);if(!session?.user)return nativeResponseJson({error:'Unauthorized'},{status:401});if(session.user.role!=='admin')return nativeResponseJson({error:'Admin access required'},{status:403});const {clientId}=await c.params;if(!/^[a-f0-9]{24}$/i.test(clientId))throw new NativeDirectoryError('Invalid client ID');return nativeResponseJson(await assignNativeClient(getNativeDatabase(),session.user.id,clientId,await r.json()));}catch(e){return nativeResponseJson({error:e instanceof NativeDirectoryError?e.message:'Unable to update assignment'},{status:e instanceof NativeDirectoryError?e.status:500});}}
