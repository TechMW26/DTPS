import {createHash,randomBytes} from 'node:crypto';
import type {Firestore,DocumentData} from 'firebase-admin/firestore';
import {z} from 'zod';
import {AppointmentType} from '@/types';
import {nativeDates} from './native-plan-editor';
export class NativeAppointmentError extends Error{constructor(message:string,public status:number){super(message);}}
const schema=z.object({dietitianId:z.string().regex(/^[a-f0-9]{24}$/),scheduledAt:z.string().datetime({offset:true}),duration:z.coerce.number().int().min(15).max(180).default(30),type:z.nativeEnum(AppointmentType).default(AppointmentType.VIDEO_CONSULTATION),notes:z.string().max(2000).default('')});
export function nativeAppointmentView(id:string,raw:DocumentData,staff:DocumentData|null){
 const data=nativeDates(raw),end=new Date(data.scheduledAt).getTime()+Number(data.duration||30)*60000;
 return {id,dietitianId:data.dietitian,dietitianName:staff?`${staff.firstName||''} ${staff.lastName||''}`.trim():'Unknown Dietitian',dietitianImage:staff?.avatar,date:data.scheduledAt,time:new Date(data.scheduledAt).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true,timeZone:'Asia/Kolkata'}),duration:data.duration||30,type:data.type==='video_consultation'?'video':data.type==='consultation'?'audio':data.type,status:['cancelled','rescheduled','completed'].includes(data.status)?data.status:end<Date.now()?'completed':'upcoming',notes:data.notes,meetingLink:data.meetingLink,zoomMeetingId:data.zoomMeetingId,zoomJoinUrl:data.zoomJoinUrl,lifecycleHistory:data.lifecycleHistory||[],cancelledBy:data.cancelledBy,rescheduledBy:data.rescheduledBy};
}
export async function nativeClientAppointments(db:Firestore,userId:string,status:string|null,page:number,limit:number){
 let query=db.collection('appointments').where('client','==',userId);if(status)query=query.where('status','==',status);
 const rows=await query.orderBy('scheduledAt','desc').offset((page-1)*limit).limit(limit).get();
 const staff=new Map<string,DocumentData>();const ids=[...new Set(rows.docs.map(row=>row.get('dietitian')).filter(id=>typeof id==='string'&&!id.includes('/')))];
 if(ids.length)for(const row of await db.getAll(...ids.map(id=>db.collection('users').doc(id))))if(row.exists)staff.set(row.id,row.data()!);
 return rows.docs.map(row=>nativeAppointmentView(row.id,row.data(),staff.get(row.get('dietitian'))||null));
}
export async function bookNativeClientAppointment(db:Firestore,userId:string,input:unknown,key?:string|null){
 const parsed=schema.safeParse(input);if(!parsed.success)throw new NativeAppointmentError('Invalid appointment details',400);
 const data=parsed.data,date=new Date(data.scheduledAt);if(date.getTime()<=Date.now())throw new NativeAppointmentError('Please select a valid future appointment time',400);
 const operation=key&&/^[a-zA-Z0-9._:-]{8,128}$/.test(key)?key:randomBytes(16).toString('hex');
 const id=createHash('sha256').update(userId+'\0'+operation).digest('hex').slice(0,24),hash=createHash('sha256').update(JSON.stringify(data)).digest('hex');
 return db.runTransaction(async tx=>{
  const ref=db.collection('appointments').doc(id);
  const [client,staff,current]=await tx.getAll(db.collection('users').doc(userId),db.collection('users').doc(data.dietitianId),ref);
  if(!client.exists||client.get('role')!=='client')throw new NativeAppointmentError('Forbidden',403);
  if(![client.get('assignedDietitian'),...(client.get('assignedDietitians')||[])].includes(data.dietitianId))throw new NativeAppointmentError('You can only book appointments with your assigned dietitian',403);
  if(!staff.exists||!['dietitian','health_counselor'].includes(staff.get('role'))||staff.get('status')!=='active')throw new NativeAppointmentError('Assigned dietitian not found',404);
  if(current.exists){if(current.get('_nativeOperationHash')!==hash)throw new NativeAppointmentError('Appointment retry conflict',409);return {created:false,appointment:nativeAppointmentView(id,current.data()!,staff.data()!)};}
  // Reading the matching range inside the transaction also detects concurrent insertions.
  const candidates=await tx.get(db.collection('appointments').where('dietitian','==',data.dietitianId).where('status','in',['scheduled','confirmed','rescheduled','in-progress']).where('scheduledAt','>=',new Date(date.getTime()-180*60000)).where('scheduledAt','<',new Date(date.getTime()+data.duration*60000)));
  if(candidates.docs.some(row=>nativeDates(row.data()).scheduledAt.getTime()+Number(row.get('duration')||30)*60000>date.getTime()))throw new NativeAppointmentError('This time slot is no longer available',409);
  const now=new Date(),record={_id:id,client:userId,dietitian:data.dietitianId,scheduledAt:date,duration:data.duration,type:data.type,notes:data.notes,status:'scheduled',createdBy:userId,createdAt:now,updatedAt:now,_nativeOperationHash:hash,lifecycleHistory:[{action:'created',performedBy:userId,performedByRole:'client',performedByName:`${client.get('firstName')||''} ${client.get('lastName')||''}`.trim()||'Client',timestamp:now}]};
  tx.create(ref,record);return {created:true,appointment:nativeAppointmentView(id,record,staff.data()!)};
 });
}
