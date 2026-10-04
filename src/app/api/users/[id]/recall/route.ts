import {NextRequest} from 'next/server';
import {nativeUserRecallHandler} from '@/lib/db/repository/native-user-recall-route';
type C={params:Promise<{id:string}>};
export const GET=(r:NextRequest,c:C)=>nativeUserRecallHandler(r,c,'GET');
export const POST=(r:NextRequest,c:C)=>nativeUserRecallHandler(r,c,'POST');
