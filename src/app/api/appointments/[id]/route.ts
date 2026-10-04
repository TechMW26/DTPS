import {NextRequest} from 'next/server';
import {nativeStaffAppointmentHandler} from '@/lib/db/repository/native-staff-appointments-route';
export const dynamic='force-dynamic';
type Context={params:Promise<{id:string}>};
export const GET=(req:NextRequest,ctx:Context)=>nativeStaffAppointmentHandler(req,ctx,'GET');
export const PUT=(req:NextRequest,ctx:Context)=>nativeStaffAppointmentHandler(req,ctx,'PUT');
export const DELETE=(req:NextRequest,ctx:Context)=>nativeStaffAppointmentHandler(req,ctx,'DELETE');
