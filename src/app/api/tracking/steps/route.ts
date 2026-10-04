import {NextRequest} from 'next/server';
import {nativeTrackingRoute} from '@/lib/db/repository/native-staff-tracking-route';
export const GET=(req:NextRequest)=>nativeTrackingRoute(req,'steps','GET');
export const POST=(req:NextRequest)=>nativeTrackingRoute(req,'steps','POST');
