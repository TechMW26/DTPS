import {nativeResponseJson} from '@/lib/api/native-response';
import {nativeClientDashboard} from './native-staff-client-dashboard';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/database';
import {nativeJson} from './native-history';
import {NativeStaffClientError} from './native-staff-client';
import {nativePendingPlans,nativeStaffStats} from './native-staff-dashboard';
import {coalesceRead} from '@/lib/api/coalesce-read';
export async function nativeStaffDashboardRoute(req:NextRequest,kind:'pending'|'dietitian'|'health_counselor'|'client'){
 try{
  const session=await getServerSession(authOptions);
  if(!session?.user?.id)throw new NativeStaffClientError('Unauthorized',401);
  const actorId=session.user.id,params=new URLSearchParams(req.nextUrl.searchParams);
  params.sort();
  // Share overlapping refreshes only for the same authenticated actor and query.
  // No settled result is retained: subsequent requests re-read permissions/data.
  const data=await coalesceRead<unknown>(`staff-dashboard:${JSON.stringify([actorId,kind,params.toString()])}`,()=>
   kind==='client'?nativeClientDashboard(getNativeDatabase(),actorId):
   kind==='pending'?nativePendingPlans(getNativeDatabase(),actorId,params):
   nativeStaffStats(getNativeDatabase(),actorId,kind));
  return nativeResponseJson(nativeJson(data));
 }catch(e){return nativeResponseJson({error:e instanceof NativeStaffClientError?e.message:'Unable to load dashboard'},{status:e instanceof NativeStaffClientError?e.status:500});}
}
