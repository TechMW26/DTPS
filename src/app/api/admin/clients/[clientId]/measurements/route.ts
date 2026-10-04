import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {readNativeStaffMeasurements,addNativeStaffMeasurements,deleteNativeStaffMeasurements} from '@/lib/db/repository/native-admin-measurements';
import {NativeDirectoryError} from '@/lib/db/repository/native-client-directory';
type Context={params:Promise<{clientId:string}>};
async function handle(r:NextRequest,c:Context,method:string){try{const session=await getServerSession(authOptions);if(!session?.user)return nativeResponseJson({error:'Unauthorized'},{status:401});const {clientId}=await c.params;if(!/^[a-f0-9]{24}$/i.test(clientId))throw new NativeDirectoryError('Invalid client ID');const db=getNativeDatabase();const result=method==='GET'?await readNativeStaffMeasurements(db,session.user.id,clientId):method==='POST'?await addNativeStaffMeasurements(db,session.user.id,clientId,await r.json()):await deleteNativeStaffMeasurements(db,session.user.id,clientId,r.nextUrl.searchParams.get('id')||'');return nativeResponseJson(result);}catch(e){return nativeResponseJson({error:e instanceof NativeDirectoryError?e.message:'Unable to process measurements'},{status:e instanceof NativeDirectoryError?e.status:500});}}
export const GET=(r:NextRequest,c:Context)=>handle(r,c,'GET');
export const POST=(r:NextRequest,c:Context)=>handle(r,c,'POST');
export const DELETE=(r:NextRequest,c:Context)=>handle(r,c,'DELETE');
