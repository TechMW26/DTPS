import {NextRequest} from 'next/server';
import {nativeLegacyMealsHandler} from '@/lib/db/repository/native-staff-legacy-meals-route';
export const dynamic='force-dynamic';
type Context={params:Promise<{id:string}>};
export const GET=(req:NextRequest,ctx:Context)=>nativeLegacyMealsHandler(req,ctx,'GET');
export const PUT=(req:NextRequest,ctx:Context)=>nativeLegacyMealsHandler(req,ctx,'PUT');
export const DELETE=(req:NextRequest,ctx:Context)=>nativeLegacyMealsHandler(req,ctx,'DELETE');
