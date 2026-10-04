import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {nativeStaffRecall} from '@/lib/db/repository/native-admin-recall';
import {NativeDirectoryError} from '@/lib/db/repository/native-client-directory';
import {ZodError} from 'zod';
type Context={params:Promise<{clientId:string}>};
async function handle(r:NextRequest,c:Context,write=false){try{const session=await getServerSession(authOptions);if(!session?.user)return nativeResponseJson({error:'Unauthorized'},{status:401});const {clientId}=await c.params;if(!/^[a-f0-9]{24}$/i.test(clientId))throw new NativeDirectoryError('Invalid client ID');return nativeResponseJson(await nativeStaffRecall(getNativeDatabase(),session.user.id,clientId,write?await r.json():undefined));}catch(e){return nativeResponseJson({error:e instanceof NativeDirectoryError?e.message:e instanceof ZodError?'Invalid recall data':'Unable to process dietary recall'},{status:e instanceof NativeDirectoryError?e.status:e instanceof ZodError?400:500});}}
export const GET=(r:NextRequest,c:Context)=>handle(r,c);
export const PUT=(r:NextRequest,c:Context)=>handle(r,c,true);
