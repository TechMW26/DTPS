import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {z} from 'zod';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/database';
import {NativeStaffClientError} from './native-staff-client';
import {listStaffAppointments,mutateStaffAppointment} from './native-staff-appointments';
type Context={params:Promise<{id:string}>};
export async function nativeStaffAppointmentHandler(req:NextRequest,ctx:Context|undefined,method:string){try{const session=await getServerSession(authOptions);if(!session?.user?.id)throw new NativeStaffClientError('Unauthorized',401);const db=getNativeDatabase(),id=ctx?(await ctx.params).id:undefined;
 if(method==='GET')return nativeResponseJson(await listStaffAppointments(db,session.user.id,req.nextUrl.searchParams,id));
 const appointment=await mutateStaffAppointment(db,session.user.id,method==='DELETE'?{}:await req.json(),id,method==='DELETE'?'cancel':method==='RESCHEDULE'?'reschedule':'save',req.headers.get('idempotency-key'));
 return nativeResponseJson(method==='DELETE'?{message:'Appointment cancelled successfully',appointment}:method==='POST'?{appointment}:method==='RESCHEDULE'?{message:'Appointment rescheduled successfully',appointment}:appointment,{status:method==='POST'?201:200});
 }catch(e){return nativeResponseJson({error:e instanceof NativeStaffClientError?e.message:e instanceof z.ZodError?'Invalid appointment fields':'Unable to process appointment'},{status:e instanceof NativeStaffClientError?e.status:e instanceof z.ZodError||e instanceof SyntaxError?400:500});}}
