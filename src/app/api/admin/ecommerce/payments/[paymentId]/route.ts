import {NextRequest} from 'next/server';
import {nativeCommerceRoute} from '@/lib/db/repository/native-staff-ecommerce-route';
type Context={params:Promise<{paymentId:string}>};
export const GET=async(req:NextRequest,ctx:Context)=>nativeCommerceRoute(req,'payments','GET',(await ctx.params).paymentId);
