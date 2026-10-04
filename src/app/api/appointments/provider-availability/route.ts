import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {z} from 'zod';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {nativeAvailableSlots,nativeProviderAvailability,saveProviderAvailability} from '@/lib/db/repository/native-staff-availability';
import {NativeStaffClientError} from '@/lib/db/repository/native-staff-client';
export const dynamic='force-dynamic';
async function run(req:NextRequest,method:string){try{const session=await getServerSession(authOptions);if(!session?.user?.id)throw new NativeStaffClientError('Unauthorized',401);const db=getNativeDatabase();if(method==='GET'){if(req.nextUrl.searchParams.get('date'))return nativeResponseJson(await nativeAvailableSlots(db,session.user.id,req.nextUrl.searchParams));const {availability}=await nativeProviderAvailability(db,session.user.id,req.nextUrl.searchParams.get('providerId')||session.user.id);return nativeResponseJson({availability});}return nativeResponseJson(await saveProviderAvailability(db,session.user.id,method==='DELETE'?Object.fromEntries(req.nextUrl.searchParams):await req.json(),method==='DELETE'));}catch(e){return nativeResponseJson({error:e instanceof NativeStaffClientError?e.message:'Unable to process availability'},{status:e instanceof NativeStaffClientError?e.status:e instanceof z.ZodError||e instanceof SyntaxError?400:500});}}
export const GET=(r:NextRequest)=>run(r,'GET');export const POST=(r:NextRequest)=>run(r,'POST');export const DELETE=(r:NextRequest)=>run(r,'DELETE');
