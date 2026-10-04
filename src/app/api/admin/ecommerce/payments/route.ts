import {NextRequest} from 'next/server';
import {nativeCommerceRoute} from '@/lib/db/repository/native-staff-ecommerce-route';
export const GET=(req:NextRequest)=>nativeCommerceRoute(req,'payments','GET');
