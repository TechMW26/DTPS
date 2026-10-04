import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {nativeUserProfessionals} from './native-user-professionals';
import {NativeDirectoryError} from './native-client-directory';
export function nativeProfessionalHandler(kind:'dietitians'|'health-counselors'|'dietitian'|'available'){return async(r:NextRequest)=>{try{const s=await getServerSession(authOptions);if(!s?.user)return nativeResponseJson({error:'Unauthorized'},{status:401});return nativeResponseJson(await nativeUserProfessionals(getNativeDatabase(),s.user.id,kind,r.nextUrl.searchParams));}catch(e){return nativeResponseJson({error:e instanceof NativeDirectoryError?e.message:'Unable to load professionals'},{status:e instanceof NativeDirectoryError?e.status:500});}};}
