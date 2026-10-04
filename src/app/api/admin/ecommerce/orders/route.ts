import {NextRequest} from 'next/server';
import {nativeCommerceRoute} from '@/lib/db/repository/native-staff-ecommerce-route';
export const GET=(req:NextRequest)=>nativeCommerceRoute(req,'orders','GET');
export const POST=(req:NextRequest)=>nativeCommerceRoute(req,'orders','POST');
