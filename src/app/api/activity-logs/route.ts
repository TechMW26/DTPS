import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {NativeDirectoryError} from '@/lib/db/repository/native-client-directory';
import {readNativeActivities,createNativeActivity,pruneNativeActivities} from '@/lib/db/repository/native-admin-activity';
async function handle(r:NextRequest,method:string){try{const session=await getServerSession(authOptions);if(!session?.user)return nativeResponseJson({error:'Unauthorized'},{status:401});const db=getNativeDatabase(),id=session.user.id;const result=method==='GET'?await readNativeActivities(db,id,r.nextUrl.searchParams):method==='POST'?await createNativeActivity(db,id,await r.json()):await pruneNativeActivities(db,id,Number(r.nextUrl.searchParams.get('daysOld')||90));return nativeResponseJson(result,{status:method==='POST'?201:200});}catch(e){return nativeResponseJson({error:e instanceof NativeDirectoryError?e.message:'Unable to process activities'},{status:e instanceof NativeDirectoryError?e.status:500});}}
export const GET=(r:NextRequest)=>handle(r,'GET');
export const POST=(r:NextRequest)=>handle(r,'POST');
export const DELETE=(r:NextRequest)=>handle(r,'DELETE');
