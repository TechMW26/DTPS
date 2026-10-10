import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse,after} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth';
import {getNativeDatabase} from '@/lib/db/database';
import {nativeClientAppointments,bookNativeClientAppointment,NativeAppointmentError} from '@/lib/db/repository/native-appointments';
import {sendNotificationToUser} from '@/lib/firebase/firebaseNotification';
export async function GET(request:NextRequest){
 try{const session=await getServerSession(authOptions);if(!session?.user?.id)return nativeResponseJson({error:'Unauthorized'},{status:401});if(session.user.role!=='client')return nativeResponseJson({error:'Forbidden'},{status:403});
 const p=request.nextUrl.searchParams,limit=Math.min(100,Math.max(1,parseInt(p.get('limit')||'50',10)||50)),page=Math.min(1000,Math.max(1,parseInt(p.get('page')||'1',10)||1));
 return nativeResponseJson(await nativeClientAppointments(getNativeDatabase(),session.user.id,p.get('status'),page,limit));
 }catch{return nativeResponseJson({error:'Failed to fetch appointments'},{status:503});}
}
export async function POST(request:NextRequest){
 try{const session=await getServerSession(authOptions);if(!session?.user?.id)return nativeResponseJson({error:'Unauthorized'},{status:401});if(session.user.role!=='client')return nativeResponseJson({error:'Forbidden'},{status:403});
 const result=await bookNativeClientAppointment(getNativeDatabase(),session.user.id,await request.json(),request.headers.get('x-idempotency-key'));
 if(result.created&&process.env.NODE_ENV==='production')after(async()=>{
  const a=result.appointment,date=new Date(a.date).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'});
  await Promise.allSettled([sendNotificationToUser(a.dietitianId,{title:'New Appointment Booked',body:`An appointment has been booked for ${date}`,data:{type:'appointment_booked',appointmentId:a.id,clientId:session.user.id},clickAction:'/appointments'}),sendNotificationToUser(session.user.id,{title:'Appointment Confirmed',body:`Your appointment is scheduled for ${date}`,data:{type:'appointment_booked',appointmentId:a.id,dietitianId:a.dietitianId},clickAction:'/user/appointments'})]);
 });
 return nativeResponseJson({success:true,appointment:result.appointment});
 }catch(error){return nativeResponseJson({error:error instanceof NativeAppointmentError?error.message:'Failed to create appointment'},{status:error instanceof NativeAppointmentError?error.status:503});}
}
