import {NextRequest} from 'next/server';
import {nativeUserRecallHandler} from '@/lib/db/repository/native-user-recall-route';
type C={params:Promise<{id:string;recallId:string}>};
export const PUT=(r:NextRequest,c:C)=>nativeUserRecallHandler(r,c,'PUT');
export const DELETE=(r:NextRequest,c:C)=>nativeUserRecallHandler(r,c,'DELETE');
