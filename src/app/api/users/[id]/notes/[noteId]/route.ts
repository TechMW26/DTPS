import {NextRequest} from 'next/server';
import {nativeUserChildHandler} from '@/lib/db/repository/native-user-children-route';
type C={params:Promise<{id:string;noteId:string}>};
export const PUT=(r:NextRequest,c:C)=>nativeUserChildHandler(r,c,'clientnotes','PUT');
export const DELETE=(r:NextRequest,c:C)=>nativeUserChildHandler(r,c,'clientnotes','DELETE');
