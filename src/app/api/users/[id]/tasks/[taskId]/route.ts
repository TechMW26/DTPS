import {NextRequest} from 'next/server';
import {nativeUserChildHandler} from '@/lib/db/repository/native-user-children-route';
type C={params:Promise<{id:string;taskId:string}>};
export const PUT=(r:NextRequest,c:C)=>nativeUserChildHandler(r,c,'tasks','PUT');
export const DELETE=(r:NextRequest,c:C)=>nativeUserChildHandler(r,c,'tasks','DELETE');
export const GET=(r:NextRequest,c:C)=>nativeUserChildHandler(r,c,'tasks','GET');
export const PATCH=PUT;
