import {NextRequest} from 'next/server';
import {nativeCommerceRoute} from '@/lib/db/repository/native-staff-ecommerce-route';
type Context={params:Promise<{orderId:string}>};
export const GET=async(req:NextRequest,ctx:Context)=>nativeCommerceRoute(req,'orders','GET',(await ctx.params).orderId);
export const PUT=async(req:NextRequest,ctx:Context)=>nativeCommerceRoute(req,'orders','PUT',(await ctx.params).orderId);
export const DELETE=async(req:NextRequest,ctx:Context)=>nativeCommerceRoute(req,'orders','DELETE',(await ctx.params).orderId);
