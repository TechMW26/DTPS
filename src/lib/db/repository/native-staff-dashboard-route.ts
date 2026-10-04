import {nativeResponseJson} from '@/lib/api/native-response';
import {nativeClientDashboard} from './native-staff-client-dashboard';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {nativeJson} from './native-history';
import {NativeStaffClientError} from './native-staff-client';
import {nativePendingPlans,nativeStaffStats} from './native-staff-dashboard';
export async function nativeStaffDashboardRoute(req:NextRequest,kind:'pending'|'dietitian'|'health_counselor'|'client'){try{const session=await getServerSession(authOptions);if(!session?.user?.id)throw new NativeStaffClientError('Unauthorized',401);return nativeResponseJson(nativeJson(await (kind==='client'?nativeClientDashboard(getNativeDatabase(),session.user.id):kind==='pending'?nativePendingPlans(getNativeDatabase(),session.user.id,req.nextUrl.searchParams):nativeStaffStats(getNativeDatabase(),session.user.id,kind))));}catch(e){return nativeResponseJson({error:e instanceof NativeStaffClientError?e.message:'Unable to load dashboard'},{status:e instanceof NativeStaffClientError?e.status:500});}}
