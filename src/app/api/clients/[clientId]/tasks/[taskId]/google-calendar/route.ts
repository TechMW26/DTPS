import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {google} from 'googleapis';
import {createHash,randomUUID} from 'node:crypto';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/database';
import {taskClientAccess} from '@/lib/db/repository/native-staff-tasks';
import {NativeStaffClientError} from '@/lib/db/repository/native-staff-client';
import {nativeDates} from '@/lib/db/repository/native-plan-editor';
import {scheduledTaskTime,TASK_TIME_ZONE,isValidMealTimeZone} from '@/lib/task-schedule';
import {formatInTimeZone} from 'date-fns-tz';
export const dynamic='force-dynamic';
type Context={params:Promise<{clientId:string;taskId:string}>};
async function run(req:NextRequest,{params}:Context,remove:boolean){
 let release:(()=>Promise<void>)|undefined;
 try{
  const session=await getServerSession(authOptions);if(!session?.user?.id)throw new NativeStaffClientError('Unauthorized',401);const {clientId,taskId}=await params;if(!/^[a-f0-9]{24}$/.test(taskId))throw new NativeStaffClientError('Invalid task ID');
  const db=getNativeDatabase(),token=randomUUID(),ref=db.collection('tasks').doc(taskId),lock=db.collection('_nativeCalendarOperations').doc(taskId);
  const captured=await db.runTransaction(async tx=>{
   const {actor}=await taskClientAccess(db,session.user.id,clientId,tx),task=await tx.get(ref),operation=await tx.get(lock);
   if(!task.exists||task.get('client')!==clientId)throw new NativeStaffClientError('Task not found',404);
   // Calendar events belong to their creator's account, including when the caller is an admin.
   if(task.get('dietitian')!==actor.id)throw new NativeStaffClientError('Only the task creator can sync their calendar',403);
   if(!actor.get('googleCalendarAccessToken'))throw new NativeStaffClientError('Google Calendar not configured. Connect it in Settings.',400);
   if(process.env.NODE_ENV!=='production')throw new NativeStaffClientError('Live calendar changes are disabled during local migration testing',409);
   if(operation.exists&&operation.get('expiresAt')?.toMillis()>Date.now())throw new NativeStaffClientError('Calendar sync is already running',409);
   tx.set(lock,{token,expiresAt:new Date(Date.now()+120000)});return {user:nativeDates(actor.data()),task:nativeDates(task.data()),version:task.updateTime!};
  });
  release=()=>db.runTransaction(async tx=>{const doc=await tx.get(lock);if(doc.get('token')===token)tx.delete(lock);});
  const {user,task}=captured,oauth=new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID,process.env.GOOGLE_CLIENT_SECRET,`${(process.env.NEXTAUTH_URL||'').replace(/\/$/,'')}/api/auth/google-calendar/callback`);
  oauth.setCredentials({access_token:user.googleCalendarAccessToken,refresh_token:user.googleCalendarRefreshToken,expiry_date:user.googleCalendarTokenExpiry?.getTime()});
  const calendar=google.calendar({version:'v3',auth:oauth}),eventId=task.googleCalendarEventId||createHash('sha256').update(session.user.id+'\0'+taskId).digest('hex');let eventLink;
  if(remove){if(!task.googleCalendarEventId)throw new NativeStaffClientError('Task not synced to Google Calendar');try{await calendar.events.delete({calendarId:'primary',eventId});}catch(e:any){if(![404,410].includes(e.code))throw e;}}
  else{const timezone=isValidMealTimeZone(user.timezone)?user.timezone:TASK_TIME_ZONE,date=formatInTimeZone(task.startDate,timezone,'yyyy-MM-dd'),start=scheduledTaskTime(date,task.allottedTime||'12:00 AM',timezone);if(start===null)throw new NativeStaffClientError('Invalid task schedule');
   const event={id:eventId,summary:task.title,description:task.description||'',start:{dateTime:new Date(start).toISOString(),timeZone:timezone},end:{dateTime:new Date(start+3600000).toISOString(),timeZone:timezone},reminders:{useDefault:false,overrides:[{method:'popup',minutes:30}]}};
   try{eventLink=(await calendar.events.insert({calendarId:'primary',requestBody:event})).data.htmlLink;}catch(e:any){if(e.code!==409)throw e;eventLink=(await calendar.events.patch({calendarId:'primary',eventId,requestBody:event})).data.htmlLink;}
  }
  await db.runTransaction(async tx=>{const current=await tx.get(ref),operation=await tx.get(lock);if(!current.exists||!current.updateTime?.isEqual(captured.version)||current.get('dietitian')!==session.user.id||operation.get('token')!==token)throw new NativeStaffClientError('Task changed during calendar sync; retry to reconcile',409);tx.update(ref,{googleCalendarEventId:remove?null:eventId,updatedAt:new Date()});const credentials=oauth.credentials;if(credentials.access_token&&credentials.access_token!==user.googleCalendarAccessToken)tx.update(db.collection('users').doc(session.user.id),{googleCalendarAccessToken:credentials.access_token,...(credentials.refresh_token?{googleCalendarRefreshToken:credentials.refresh_token}:{}),...(credentials.expiry_date?{googleCalendarTokenExpiry:new Date(credentials.expiry_date)}:{})});tx.delete(lock);});
  return nativeResponseJson({success:true,message:remove?'Task removed from Google Calendar':'Task synced to Google Calendar',...(!remove?{eventId,eventLink}: {})});
 }catch(e){return nativeResponseJson({error:e instanceof NativeStaffClientError?e.message:'Unable to sync calendar. Reconnect your calendar if access expired.'},{status:e instanceof NativeStaffClientError?e.status:502});}finally{await release?.().catch(()=>{});}
}
export const POST=(req:NextRequest,ctx:Context)=>run(req,ctx,false);
export const DELETE=(req:NextRequest,ctx:Context)=>run(req,ctx,true);
