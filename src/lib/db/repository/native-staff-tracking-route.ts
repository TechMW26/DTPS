import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {z} from 'zod';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {nativeDailyTracking,nativeFitness} from './native-staff-tracking';
import {nativeJson} from './native-history';
import {NativeStaffClientError} from './native-staff-client';
export async function nativeTrackingRoute(req:NextRequest,kind:'water'|'steps'|'sleep'|'weight'|'fitness',method:string){try{const session=await getServerSession(authOptions);if(!session?.user?.id)throw new NativeStaffClientError('Unauthorized',401);const input=method==='GET'?undefined:await req.json(),db=getNativeDatabase();return nativeResponseJson(nativeJson(kind==='fitness'?await nativeFitness(db,session.user.id,method,input):await nativeDailyTracking(db,session.user.id,kind,input,req.headers.get('idempotency-key'))));}catch(e){return nativeResponseJson({error:e instanceof NativeStaffClientError?e.message:e instanceof z.ZodError?'Invalid tracking details':'Unable to process tracking'},{status:e instanceof NativeStaffClientError?e.status:e instanceof z.ZodError||e instanceof SyntaxError?400:500});}}
