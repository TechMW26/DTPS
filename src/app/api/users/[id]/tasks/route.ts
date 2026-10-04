import {NextRequest} from 'next/server';
import {nativeUserChildHandler} from '@/lib/db/repository/native-user-children-route';
type C={params:Promise<{id:string}>};
export const GET=(r:NextRequest,c:C)=>nativeUserChildHandler(r,c,'tasks','GET');
export const POST=(r:NextRequest,c:C)=>nativeUserChildHandler(r,c,'tasks','POST');
