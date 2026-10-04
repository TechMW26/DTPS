import {NextRequest} from 'next/server';
import {nativeStaffAppointmentHandler} from '@/lib/db/repository/native-staff-appointments-route';
export const dynamic='force-dynamic';
export const GET=(req:NextRequest)=>nativeStaffAppointmentHandler(req,undefined,'GET');
export const POST=(req:NextRequest)=>nativeStaffAppointmentHandler(req,undefined,'POST');
