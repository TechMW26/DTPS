import {NextRequest} from 'next/server';
import {nativeStaffAppointmentHandler} from '@/lib/db/repository/native-staff-appointments-route';
export const dynamic='force-dynamic';
export const POST=(req:NextRequest,ctx:{params:Promise<{id:string}>})=>nativeStaffAppointmentHandler(req,ctx,'RESCHEDULE');
