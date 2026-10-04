import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {nativeUserAvailability} from '@/lib/db/repository/native-user-availability';
import {NativeDirectoryError} from '@/lib/db/repository/native-client-directory';
async function handle(r:NextRequest,method:string){try{const s=await getServerSession(authOptions);if(!s?.user)return nativeResponseJson({error:'Unauthorized'},{status:401});return nativeResponseJson(await nativeUserAvailability(getNativeDatabase(),s.user.id,method==='GET'?r.nextUrl.searchParams.get('dietitianId')||s.user.id:s.user.id,method==='GET'?undefined:await r.json(),method==='POST'));}catch(e){return nativeResponseJson({error:e instanceof NativeDirectoryError?e.message:'Unable to process availability'},{status:e instanceof NativeDirectoryError?e.status:500});}}
export const GET=(r:NextRequest)=>handle(r,'GET');
export const POST=(r:NextRequest)=>handle(r,'POST');
export const PUT=(r:NextRequest)=>handle(r,'PUT');
