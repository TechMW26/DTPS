import {createHash} from 'node:crypto';
import {google,type calendar_v3} from 'googleapis';
import {type DocumentData} from '@/lib/db/mongo-types';
import {getNativeDatabase} from '@/lib/db/database';
import {nativeDates} from '@/lib/db/repository/native-plan-editor';
import {getNativeGoogleCalendarClient} from './native-google-calendar';
import {requiresMeetingLink} from './meetingLink';

/** Idempotent event IDs and Google ETags prevent duplicated events and stale concurrent overwrites. */
export async function deliverNativeAppointmentCalendar(job:DocumentData):Promise<'sent'|'skipped'|'disabled'>{
 if(process.env.NODE_ENV!=='production')return 'disabled';
 const db=getNativeDatabase(),ref=db.collection('appointments').doc(job.appointmentId),row=await ref.get();
 if(!row.exists||row.get('client')!==job.clientId||row.get('dietitian')!==job.providerId)throw new Error('Appointment proof changed');
 const appointment=nativeDates(row.data()),userId=job.calendarRole==='dietitian'?job.providerId:job.clientId;
 const auth=await getNativeGoogleCalendarClient(userId);if(!auth)return 'skipped';
 const calendar=google.calendar({version:'v3',auth}),eventId=appointment.googleCalendarEventId?.[job.calendarRole]||createHash('sha256').update('dtps-appointment\0'+job.appointmentId+'\0'+userId).digest('hex');
 let current:calendar_v3.Schema$Event|null=null;
 try{current=(await calendar.events.get({calendarId:'primary',eventId})).data;}catch(e){if((e as {code?:number}).code!==404&&(e as {code?:number}).code!==410)throw new Error('Calendar lookup was not confirmed');}
 if(appointment.status==='cancelled'){
  if(!current||current.status==='cancelled')return 'skipped';
  await calendar.events.delete({calendarId:'primary',eventId,sendUpdates:'all'},{headers:current.etag?{'If-Match':current.etag}:{}});return 'sent';
 }
 if(appointment.status==='completed'||appointment.status==='no_show')return 'skipped';
 const when=new Date(appointment.scheduledAt),duration=Number(appointment.duration||60);if(!Number.isFinite(when.getTime()))throw new Error('Invalid appointment schedule');
 const body:calendar_v3.Schema$Event={summary:'DTPS consultation',description:'Your DTPS consultation appointment.',start:{dateTime:when.toISOString()},end:{dateTime:new Date(when.getTime()+duration*60000).toISOString()},...(appointment.location?{location:appointment.location}:{})};
 if(job.calendarRole==='dietitian'&&requiresMeetingLink(String(appointment.modeName||appointment.type||''))&&!current?.hangoutLink&&!appointment.meetingLink)body.conferenceData={createRequest:{requestId:createHash('sha256').update(eventId).digest('hex'),conferenceSolutionKey:{type:'hangoutsMeet'}}};
 if(appointment.meetingLink)body.description+='\nJoin: '+appointment.meetingLink;
 const fresh=await ref.get();if(fresh.get('updatedAt')?.toMillis?.()!==row.get('updatedAt')?.toMillis?.())throw new Error('Appointment changed before calendar delivery');
 const response=current?await calendar.events.patch({calendarId:'primary',eventId,conferenceDataVersion:1,sendUpdates:'all',requestBody:body},{headers:current.etag?{'If-Match':current.etag}:{}}):await calendar.events.insert({calendarId:'primary',conferenceDataVersion:1,sendUpdates:'all',requestBody:{...body,id:eventId}});
 const meetingLink=response.data.hangoutLink||response.data.conferenceData?.entryPoints?.find(p=>p.entryPointType==='video')?.uri;
 await db.runTransaction(async tx=>{const latest=await tx.get(ref);if(!latest.exists||latest.get('client')!==job.clientId||latest.get('dietitian')!==job.providerId)throw new Error('Appointment changed during calendar delivery');tx.update(ref,{['googleCalendarEventId.'+job.calendarRole]:eventId,...(meetingLink&&job.calendarRole==='dietitian'?{meetingLink,meetingProvider:'google_meet','meetingDetails.meetingId':response.data.conferenceData?.conferenceId||eventId,'meetingDetails.joinUrl':meetingLink,'meetingDetails.provider':'google_meet'}:{})});});
 return 'sent';
}
