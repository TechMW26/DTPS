import {NextRequest} from 'next/server';
import {nativeWooRoute} from '@/lib/db/repository/native-staff-woocommerce-route';
export const GET=(req:NextRequest)=>nativeWooRoute(req,'clients','GET');
export const POST=(req:NextRequest)=>nativeWooRoute(req,'clients','POST');
export const DELETE=(req:NextRequest)=>nativeWooRoute(req,'clients','DELETE');
