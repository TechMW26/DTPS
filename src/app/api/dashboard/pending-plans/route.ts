import {NextRequest} from 'next/server';
import {nativeStaffDashboardRoute} from '@/lib/db/repository/native-staff-dashboard-route';
export const dynamic='force-dynamic';
export const GET=async(request:NextRequest)=>{
 const response=await nativeStaffDashboardRoute(request,'pending');
 response.headers.set('Cache-Control','private, no-store, max-age=0');
 return response;
};
