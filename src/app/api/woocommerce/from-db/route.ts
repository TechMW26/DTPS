import {NextRequest} from 'next/server';
import {nativeWooRoute} from '@/lib/db/repository/native-staff-woocommerce-route';
export const GET=(req:NextRequest)=>nativeWooRoute(req,'database','GET');
export const DELETE=(req:NextRequest)=>nativeWooRoute(req,'database','DELETE');
