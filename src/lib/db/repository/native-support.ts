import {randomBytes} from 'node:crypto';
import {type MongoDatabase,type Query,type DocumentData} from '@/lib/db/mongo-types';
import {z} from 'zod';
import {prepareNativeDocument,hydrateNativeDocument,prepareNativePatch} from '@/lib/storage/native-document';
import {nativeDates} from './native-plan-editor';
import {assertNativeAlertAdmin,NativeAlertError} from './native-system-alerts';
const contact=z.object({name:z.string().trim().min(1).max(150),email:z.string().email().max(254),subject:z.string().trim().min(1).max(200),message:z.string().trim().min(1).max(10000)});
const bug=z.object({title:z.string().trim().min(1).max(200),category:z.enum(['ui','performance','crash','feature','security','other']).default('other'),description:z.string().trim().min(1).max(20000),steps:z.string().max(20000).default(''),expectedBehavior:z.string().max(10000).default(''),deviceInfo:z.string().max(3000).default(''),screenshots:z.array(z.string().max(500000)).max(5).default([])});
export async function createNativeSupport(db:MongoDatabase,kind:'contact'|'bug',input:unknown,userId:string|null,email:string|null){
 const id=randomBytes(12).toString('hex'),now=new Date(),data=kind==='contact'?contact.parse(input):bug.parse(input);
 const priority='category'in data&&['crash','security'].includes(data.category)?'high':'category'in data&&['ui','feature'].includes(data.category)?'low':'medium';
 const record={...data,_id:id,userId,createdAt:now,updatedAt:now,status:kind==='contact'?'pending':'open',...(kind==='bug'?{userEmail:email,priority}:{})};
 await db.collection(kind==='contact'?'contactmessages':'bugreports').doc(id).create(await prepareNativeDocument(record));
 return {id,priority};
}
async function view(db:MongoDatabase,row:DocumentData){
 const data=nativeDates(await hydrateNativeDocument(row));
 for(const key of ['userId','assignedTo'])if(typeof data[key]==='string'&&/^[a-f0-9]{24}$/.test(data[key])){
  const user=await db.collection('users').doc(data[key]).get();data[key]=user.exists?{_id:user.id,name:user.get('name')||`${user.get('firstName')||''} ${user.get('lastName')||''}`.trim(),email:user.get('email')||''}:null;
 }
 return data;
}
export async function listNativeSupport(db:MongoDatabase,kind:'contact'|'bug',params:URLSearchParams){
 const collection=db.collection(kind==='contact'?'contactmessages':'bugreports');let query:Query=collection;
 for(const key of kind==='contact'?['status']:['status','priority','category'])if(params.get(key))query=query.where(key,'==',params.get(key));
 const page=Math.min(10000,Math.max(1,parseInt(params.get('page')||'1',10)||1)),limit=Math.min(100,Math.max(1,parseInt(params.get('limit')||'20',10)||20));
 const [rows,count]=await Promise.all([query.orderBy('createdAt','desc').offset((page-1)*limit).limit(limit).get(),query.count().get()]);
 const items=await Promise.all(rows.docs.map(row=>view(db,{...row.data(),_id:row.id}))),total=count.data().count;
 if(kind==='contact')return {messages:items,pagination:{page,limit,total,pages:Math.ceil(total/limit)}};
 const [all,open,inProgress,resolved,critical]=await Promise.all([collection.count().get(),collection.where('status','==','open').count().get(),collection.where('status','==','in-progress').count().get(),collection.where('status','==','resolved').count().get(),collection.where('priority','==','critical').where('status','!=','closed').count().get()]);
 return {reports:items,stats:{total:all.data().count,open:open.data().count,inProgress:inProgress.data().count,resolved:resolved.data().count,critical:critical.data().count},pagination:{page,limit,total,pages:Math.ceil(total/limit)}};
}
export async function updateNativeBugReport(db:MongoDatabase,actorId:string,input:unknown){
 const {reportId,...patch}=z.object({reportId:z.string().regex(/^[a-f0-9]{24}$/),status:z.enum(['open','in-progress','resolved','closed']).optional(),priority:z.enum(['low','medium','high','critical']).optional(),resolution:z.string().max(20000).optional(),assignedTo:z.string().regex(/^[a-f0-9]{24}$/).optional()}).parse(input);
 await db.runTransaction(async tx=>{
  const [actor,row]=await tx.getAll(db.collection('users').doc(actorId),db.collection('bugreports').doc(reportId));
  if(actor.get('role')!=='admin'||actor.get('status')==='inactive')throw new NativeAlertError('Forbidden',403);
  if(!row.exists)throw new NativeAlertError('Bug report not found',404);
  if(patch.assignedTo){const staff=await tx.get(db.collection('users').doc(patch.assignedTo));if(!staff.exists||!['admin','dietitian','health_counselor'].includes(staff.get('role')))throw new NativeAlertError('Invalid assignee',400);}
  tx.update(row.ref,await prepareNativePatch(row.data()!,{...patch,updatedAt:new Date(),...(patch.status==='resolved'?{resolvedAt:new Date()}:{})}));
 });
 const row=await db.collection('bugreports').doc(reportId).get();return view(db,{...row.data(),_id:reportId});
}
