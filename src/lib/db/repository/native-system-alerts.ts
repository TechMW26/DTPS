import {type Firestore,type Query,type DocumentData} from 'firebase-admin/firestore';
import {z} from 'zod';
import {createNativeAudit} from './native-audit';
import {nativeDates} from './native-plan-editor';
import {hydrateNativeDocument,prepareNativePatch} from '@/lib/storage/native-document';
export class NativeAlertError extends Error{constructor(message:string,public status:number){super(message);}}
export const nativeAlertInput=z.object({type:z.enum(['info','warning','error','success','critical']).default('info'),source:z.enum(['database','api','auth','payment','email','file','system','user_action','cron','integration']),title:z.string().max(200).optional(),message:z.string().min(1).max(1000),priority:z.enum(['low','medium','high','critical']).default('low'),category:z.enum(['database_error','api_error','auth_failure','payment_failure','email_failure','validation_error','performance','security','maintenance','other']).default('other'),details:z.record(z.string(),z.unknown()).optional(),errorStack:z.string().max(20000).optional(),affectedResource:z.string().max(1000).optional(),affectedResourceId:z.string().max(200).optional()});
export const nativeAlertPatch=z.object({status:z.enum(['new','acknowledged','resolved','ignored']).optional(),resolution:z.string().max(10000).optional(),isRead:z.boolean().optional()});
export async function assertNativeAlertAdmin(db:Firestore,id:string){const user=await db.collection('users').doc(id).get();if(user.get('role')!=='admin'||user.get('status')==='inactive')throw new NativeAlertError('Forbidden',403);}
export async function createNativeSystemAlert(db:Firestore,input:unknown,createdBy?:string){
 const data=nativeAlertInput.parse(input);
 if(Buffer.byteLength(JSON.stringify(data))>250000)throw new NativeAlertError('Alert details too large',400);
 return createNativeAudit(db,'systemalerts',{...data,...(createdBy?{createdBy}:{}),status:'new',isRead:false,notificationSent:false});
}
export async function mutateNativeSystemAlerts(db:Firestore,actorId:string,ids:string[],input:unknown,remove=false,cleanupBefore?:Date){
 const unique=[...new Set(ids)];if(!unique.length||unique.length>400||unique.some(id=>!/^[a-f0-9]{24}$/.test(id)))throw new NativeAlertError('Invalid alert IDs',400);
 const patch=nativeAlertPatch.parse(input),now=new Date();
 return db.runTransaction(async tx=>{
  const actor=await tx.get(db.collection('users').doc(actorId));if(actor.get('role')!=='admin'||actor.get('status')==='inactive')throw new NativeAlertError('Forbidden',403);
  const rows=await tx.getAll(...unique.map(id=>db.collection('systemalerts').doc(id)));let count=0;
  for(const row of rows){if(!row.exists)continue;if(cleanupBefore&&(!['resolved','ignored'].includes(row.get('status'))||!(row.get('createdAt')?.toMillis?.()<cleanupBefore.getTime())))continue;if(remove)tx.delete(row.ref);else tx.update(row.ref,await prepareNativePatch(row.data()!,{...patch,updatedAt:now,...(patch.status==='resolved'?{resolvedBy:actorId,resolvedAt:now}:{})}));count++;}
  return count;
 });
}
export async function nativeSystemAlertView(db:Firestore,raw:DocumentData){
 const row=nativeDates(await hydrateNativeDocument(raw));
 for(const key of ['createdBy','resolvedBy'])if(typeof row[key]==='string'&&/^[a-f0-9]{24}$/.test(row[key])){
  const user=await db.collection('users').doc(row[key]).get();row[key]=user.exists?{_id:user.id,...Object.fromEntries(['firstName','lastName','email'].filter(field=>user.get(field)!==undefined).map(field=>[field,user.get(field)]))}:null;
 }
 return row;
}
export async function listNativeSystemAlerts(db:Firestore,params:URLSearchParams){
 const page=Math.min(10000,Math.max(1,parseInt(params.get('page')||'1',10)||1)),limit=Math.min(200,Math.max(1,parseInt(params.get('limit')||'50',10)||50));
 let query:Query=db.collection('systemalerts');
 for(const key of ['type','source','priority','category','status'])if(params.get(key))query=query.where(key,'==',params.get(key));
 for(const [key,op] of [['startDate','>='],['endDate','<=']] as const)if(params.get(key)){
  const date=new Date(params.get(key)!);if(!Number.isFinite(date.getTime()))throw new NativeAlertError('Invalid date',400);query=query.where('createdAt',op,date);
 }
 const search=params.get('search')?.trim().toLowerCase();
 let total:number,selected:FirebaseFirestore.QueryDocumentSnapshot[];
 if(search){
  const rows=await query.orderBy('createdAt','desc').select('title','message','affectedResource').get();
  const matching=rows.docs.filter(row=>['title','message','affectedResource'].some(key=>String(row.get(key)||'').toLowerCase().includes(search)));
  total=matching.length;const ids=matching.slice((page-1)*limit,page*limit);
  selected=ids.length?await db.getAll(...ids.map(row=>row.ref)) as FirebaseFirestore.QueryDocumentSnapshot[]:[];
 }else{
  const [count,rows]=await Promise.all([query.count().get(),query.orderBy('createdAt','desc').offset((page-1)*limit).limit(limit).get()]);total=count.data().count;selected=rows.docs;
 }
 const summary=await db.collection('systemalerts').select('type','source','priority','status','category','isRead','createdAt').get();
 const stats:any={byType:[],bySource:[],byPriority:[],byStatus:[],byCategory:[],unreadCount:0,criticalCount:0,todayCount:0};
 const now=new Date(Date.now()+330*60000),today=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate())-330*60000;
 for(const key of ['type','source','priority','status','category']){const counts=new Map<string,number>();for(const row of summary.docs){const value=row.get(key)||'unknown';counts.set(value,(counts.get(value)||0)+1);}stats['by'+key[0].toUpperCase()+key.slice(1)]=[...counts].map(([_id,count])=>({_id,count}));}
 for(const row of summary.docs){if(row.get('isRead')===false)stats.unreadCount++;if(row.get('priority')==='critical'&&row.get('status')==='new')stats.criticalCount++;if((row.get('createdAt')?.toMillis?.()||0)>=today)stats.todayCount++;}
 return {alerts:await Promise.all(selected.map(row=>nativeSystemAlertView(db,{...row.data(),_id:row.id}))),pagination:{page,limit,total,totalPages:Math.ceil(total/limit)},stats};
}
