import {NextRequest} from 'next/server';
import {nativeStaffDashboardRoute} from '@/lib/db/repository/native-staff-dashboard-route';
export const GET=(request:NextRequest)=>nativeStaffDashboardRoute(request,'health_counselor');
