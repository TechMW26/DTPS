import {NextRequest} from 'next/server';
import {nativeTrackingRoute} from '@/lib/db/repository/native-staff-tracking-route';
export const GET=(req:NextRequest)=>nativeTrackingRoute(req,'fitness','GET');
export const POST=(req:NextRequest)=>nativeTrackingRoute(req,'fitness','POST');
export const PUT=(req:NextRequest)=>nativeTrackingRoute(req,'fitness','PUT');
