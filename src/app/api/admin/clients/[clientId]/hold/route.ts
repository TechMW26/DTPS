import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {changeNativeClientHold,readNativeClientHold} from '@/lib/db/repository/native-client-hold';
import {NativeDirectoryError} from '@/lib/db/repository/native-client-directory';
type Context={params:Promise<{clientId:string}>};
async function handle(r:NextRequest,c:Context,onHold?:boolean){try{const session=await getServerSession(authOptions);if(!session?.user)return nativeResponseJson({error:'Unauthorized'},{status:401});const {clientId}=await c.params;if(!/^[a-f0-9]{24}$/i.test(clientId))throw new NativeDirectoryError('Invalid client ID');const db=getNativeDatabase();const result=onHold===undefined?await readNativeClientHold(db,session.user.id,clientId):await changeNativeClientHold(db,session.user.id,clientId,onHold,(await r.json().catch(()=>({}))).reason||'');return nativeResponseJson(result);}catch(e){return nativeResponseJson({error:e instanceof NativeDirectoryError?e.message:'Unable to update hold status'},{status:e instanceof NativeDirectoryError?e.status:500});}}
export const GET=(r:NextRequest,c:Context)=>handle(r,c);
export const POST=(r:NextRequest,c:Context)=>handle(r,c,true);
export const DELETE=(r:NextRequest,c:Context)=>handle(r,c,false);
