import {Filter,type Firestore,type DocumentData,type Query} from 'firebase-admin/firestore';
import {NativePlanEditor,nativeDates,nativePlanStaffAccess} from './native-plan-editor';

const pick=(data:DocumentData|null,keys:string[])=>data?Object.fromEntries(['_id',...keys].filter(key=>data[key]!==undefined).map(key=>[key,data[key]])):null;
const paymentKeys=['planName','planCategory','durationDays','durationLabel','status','paymentStatus','paidAt','razorpayPaymentId','transactionId','finalAmount','baseAmount','paymentMethod'];
export async function populateNativePlan(editor:NativePlanEditor,plan:DocumentData):Promise<DocumentData>{
 const [client,staff,template,purchase]=await Promise.all([
  typeof plan.clientId==='string'?editor.projection('users',plan.clientId,['firstName','lastName','email']):null,
  typeof plan.dietitianId==='string'?editor.projection('users',plan.dietitianId,['firstName','lastName']):null,
  typeof plan.templateId==='string'?editor.projection('diettemplates',plan.templateId,['name','category','duration']):null,
  typeof plan.purchaseId==='string'?editor.projection('unifiedpayments',plan.purchaseId,['client',...paymentKeys]):null,
 ]);
 const hydrated=await editor.hydrate(plan);
 return {...hydrated,clientId:pick(client,['firstName','lastName','email']),dietitianId:pick(staff,['firstName','lastName']),
  ...(plan.templateId?{templateId:pick(template,['name','category','duration'])}:{}),
  ...(plan.purchaseId?{purchaseId:purchase?.client===plan.clientId?pick(purchase,paymentKeys):null}:{}),
 };
}
export async function listNativePlans(db:Firestore,actor:{id:string;role:string},options:{clientId:string|null;status:string|null;includeDeleted:boolean;page:number;limit:number}){
 const editor=new NativePlanEditor(db),current=await editor.document('users',actor.id);
 if(!current||current.isActive===false||['inactive','suspended'].includes(current.status))return {status:403 as const};
 const role=current.role==='dietician'?'dietitian':current.role;
 if(!['admin','dietitian','health_counselor','client'].includes(role))return {status:403 as const};
 let clientIds:string[]|undefined;
 if(role==='client')clientIds=[actor.id];
 else if(options.clientId){
  if(role!=='admin'&&!await nativePlanStaffAccess(editor,{clientId:options.clientId},{...actor,role}))return {status:403 as const};
  clientIds=[options.clientId];
 }else if(role!=='admin'){
  const single=role==='health_counselor'?'assignedHealthCounselor':'assignedDietitian';
  const plural=role==='health_counselor'?'assignedHealthCounselors':'assignedDietitians';
  const clients=await db.collection('users').where('role','==','client').where(Filter.or(Filter.where(single,'==',actor.id),Filter.where(plural,'array-contains',actor.id))).select().get();
  clientIds=clients.docs.map(doc=>doc.id);
 }
 // Read only the small sorting/visibility projection. Hydrate large meal payloads for this page only.
 // Legacy records may omit isDeleted; filtering it here preserves those records until the derived list index is built.
 const rows:DocumentData[]=[];
 const load=async(ids?:string[])=>{
  let query:Query=db.collection('clientmealplans');if(ids)query=query.where('clientId','in',ids);
  if(options.status&&options.status!=='all')query=query.where('status','==',options.status);
  if(clientIds)query=query.orderBy('clientId');
  const result=await query.select('clientId','status','isDeleted','createdAt').get();
  rows.push(...result.docs.map(doc=>({...nativeDates(doc.data()),_id:doc.id})));
 };
 if(clientIds){for(let start=0;start<clientIds.length;start+=180)await Promise.all(Array.from({length:Math.min(6,Math.ceil((clientIds.length-start)/30))},(_,slot)=>load(clientIds.slice(start+slot*30,start+slot*30+30))));}else await load();
 const visible=rows.filter(row=>(role==='admin'&&options.includeDeleted||!row.isDeleted)&&(role!=='client'||['active','completed','paused'].includes(row.status)));
 visible.sort((a,b)=>new Date(b.createdAt||0).getTime()-new Date(a.createdAt||0).getTime()||String(b._id).localeCompare(String(a._id)));
 const selected=visible.slice((options.page-1)*options.limit,options.page*options.limit),plans:DocumentData[]=[];
 for(let i=0;i<selected.length;i+=8){const batch=await Promise.all(selected.slice(i,i+8).map(async row=>{
  const plan=await editor.document('clientmealplans',row._id);if(!plan)return null;
  if(!(role==='admin'&&options.includeDeleted)&&plan.isDeleted)return null;
  if(role==='client'&&(plan.clientId!==actor.id||!['active','completed','paused'].includes(plan.status)))return null;
  if(role!=='client'&&role!=='admin'&&!await nativePlanStaffAccess(editor,plan,{...actor,role}))return null;
  return populateNativePlan(editor,plan);
 }));plans.push(...batch.filter((plan):plan is DocumentData=>!!plan));}
 return {status:200 as const,plans,total:visible.length};
}
