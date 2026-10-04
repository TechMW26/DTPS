import {NextRequest} from 'next/server';
import {nativeLegacyMealsHandler} from '@/lib/db/repository/native-staff-legacy-meals-route';
export const dynamic='force-dynamic';
export const GET=(req:NextRequest)=>nativeLegacyMealsHandler(req,undefined,'GET');
export const POST=(req:NextRequest)=>nativeLegacyMealsHandler(req,undefined,'POST');
