import {nativeMigrationIssues} from './native-migration-issues';
import {type Firestore,type DocumentData} from 'firebase-admin/firestore';
import {nativeDates} from './native-plan-editor';
import {computeClientStatusFromDocs} from '@/lib/status/computeClientStatus';

export class NativeDirectoryError extends Error {constructor(message:string,public status=400){super(message);}}
export const directoryFields=['_nativeMigrationIssues','firstName','lastName','email','phone','clientId','role','status','clientStatus','avatar','createdAt','updatedAt','dateOfBirth','gender','heightCm','weightKg','generalGoal','onboardingCompleted','assignedDietitian','assignedDietitians','assignedHealthCounselor','assignedHealthCounselors','holdStatus','tags','createdBy'] as const;
export const filterFields=['firstName','lastName','email','phone','clientId','role','status','clientStatus','createdAt','onboardingCompleted','assignedDietitian','assignedDietitians','assignedHealthCounselor','assignedHealthCounselors','holdStatus'] as const;
export function nativeDirectoryProfile(id:string,data:DocumentData){return {_id:id,...nativeDates(Object.fromEntries(directoryFields.filter(key=>data[key]!==undefined).map(key=>[key,key==='_nativeMigrationIssues'?nativeMigrationIssues(data[key]):data[key]])))} as DocumentData;}
const assigned=(d:DocumentData)=>!!d.assignedDietitian||(Array.isArray(d.assignedDietitians)&&d.assignedDietitians.length>0);
function integer(value:string|null,fallback:number,max:number){const n=value===null?fallback:Number(value);if(!Number.isSafeInteger(n)||n<1||n>max)throw new NativeDirectoryError('Invalid pagination');return n;}
function dateBoundary(value:string|null,end=false){if(!value)return undefined;if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new NativeDirectoryError('Invalid date');const d=new Date(`${value}T${end?'23:59:59.999':'00:00:00.000'}+05:30`);if(!Number.isFinite(d.getTime()))throw new NativeDirectoryError('Invalid date');return d;}
export async function populateNativeDirectory(db:Firestore,rows:DocumentData[]):Promise<DocumentData[]>{
 const ids=[...new Set(rows.flatMap(d=>[d.assignedDietitian,d.assignedHealthCounselor,...(d.assignedDietitians||[]),...(d.assignedHealthCounselors||[]),d.createdBy?.userId]).filter(id=>typeof id==='string'&&id&&!id.includes('/')))];
 const people=new Map<string,DocumentData>();
 for(let i=0;i<ids.length;i+=100){for(const doc of await db.getAll(...ids.slice(i,i+100).map(id=>db.collection('users').doc(id)),{fieldMask:['firstName','lastName','email','avatar','role']})){if(doc.exists)people.set(doc.id,{_id:doc.id,...nativeDates(doc.data())});}}
 return rows.map(d=>({...d,...Object.fromEntries(['assignedDietitian','assignedHealthCounselor'].filter(k=>typeof d[k]==='string').map(k=>[k,people.get(d[k])||null])),...Object.fromEntries(['assignedDietitians','assignedHealthCounselors'].filter(k=>Array.isArray(d[k])).map(k=>[k,d[k].map((id:string)=>people.get(id)).filter(Boolean)])),...(d.createdBy?.userId?{createdBy:{...d.createdBy,userId:people.get(d.createdBy.userId)||null}}:{})}));
}
export async function nativeDirectoryStatuses(db:Firestore,rows:DocumentData[]){
 const result=new Map<string,DocumentData[]>();const ids=rows.filter(d=>d.role==='client').map(d=>d._id as string);
 for(let batch=0;batch<ids.length;batch+=180){await Promise.all(Array.from({length:Math.min(6,Math.ceil((ids.length-batch)/30))},async(_,slot)=>{const i=batch+slot*30;const payments=await db.collection('unifiedpayments').where('client','in',ids.slice(i,i+30)).select('client','status','paymentStatus','expectedEndDate','endDate').get();for(const p of payments.docs){const d=nativeDates(p.data());result.set(d.client,[...(result.get(d.client)||[]),d]);}}));}
 return rows.map(d=>d.role==='client'?{...d,clientStatus:computeClientStatusFromDocs(result.get(d._id)||[],!!d.holdStatus?.isOnHold)}:d);
}
/** Filter projections contain no passwords, tokens, documents or medical histories. Full profiles are never scanned. */
export async function listNativeAdminClients(db:Firestore,params:URLSearchParams){
 const page=integer(params.get('page'),1,100000),limit=integer(params.get('limit'),20,100),search=(params.get('search')||'').trim().toLowerCase(),status=params.get('status')||'',assignment=params.get('assigned')||'',onboarding=params.get('onboarding')||'';
 const from=dateBoundary(params.get('dateFrom')),to=dateBoundary(params.get('dateTo'),true);if(from&&to&&from>to)throw new NativeDirectoryError('Start date must not exceed end date');
 const dt=params.get('dietitianId'),hc=params.get('healthCounselorId');for(const id of [dt,hc])if(id&&!/^[a-f0-9]{24}$/i.test(id))throw new NativeDirectoryError('Invalid staff ID');
 let query:FirebaseFirestore.Query=db.collection('users').where('role','==','client');if(from)query=query.where('createdAt','>=',from);if(to)query=query.where('createdAt','<=',to);if(dt)query=query.where('assignedDietitian','==',dt);if(hc)query=query.where('assignedHealthCounselor','==',hc);if(onboarding==='done')query=query.where('onboardingCompleted','==',true);
 const all=await db.collection('users').where('role','==','client').select('assignedDietitian','assignedDietitians').get();const assignedCount=all.docs.reduce((n,d)=>n+Number(assigned(d.data())),0);
 let ids:string[],total:number;let pageProfiles:DocumentData[]|undefined;let filteredStatuses:Map<string,unknown>|undefined;
 if(!search&&!status&&!assignment&&onboarding!=='pending'){
  const [count,docs]=await Promise.all([query.count().get(),query.orderBy('createdAt','desc').offset((page-1)*limit).limit(limit).select(...directoryFields).get()]);total=count.data().count;ids=docs.docs.map(d=>d.id);pageProfiles=docs.docs.map(d=>nativeDirectoryProfile(d.id,d.data()));
 }else{
  const candidate=await query.select(...filterFields).get();let rows:DocumentData[]=candidate.docs.map(d=>({_id:d.id,...nativeDates(d.data())}));
  rows=rows.filter(d=>{if(assignment==='true'&&!assigned(d)||assignment==='false'&&assigned(d))return false;if(onboarding==='pending'&&d.onboardingCompleted===true)return false;if(!search)return true;const digits=search.replace(/\D/g,'');return ['firstName','lastName','email','phone','clientId'].some(k=>String(d[k]||'').toLowerCase().includes(search))||`${d.firstName||''} ${d.lastName||''}`.toLowerCase().includes(search)||`${d.lastName||''} ${d.firstName||''}`.toLowerCase().includes(search)||(digits.length>=6&&String(d.phone||'').replace(/\D/g,'').includes(digits));});
  if(status){rows=await nativeDirectoryStatuses(db,rows);filteredStatuses=new Map(rows.map(d=>[d._id,d.clientStatus]));rows=rows.filter(d=>d.clientStatus===status);}
  rows.sort((a,b)=>new Date(b.createdAt||0).getTime()-new Date(a.createdAt||0).getTime()||a._id.localeCompare(b._id));total=rows.length;ids=rows.slice((page-1)*limit,page*limit).map(d=>d._id);
 }
 const docs=!pageProfiles&&ids.length?await db.getAll(...ids.map(id=>db.collection('users').doc(id)),{fieldMask:[...directoryFields]}):[];
 const profiles=pageProfiles||docs.filter(d=>d.exists).map(d=>nativeDirectoryProfile(d.id,d.data()!));
 const clients=await populateNativeDirectory(db,filteredStatuses?profiles.map(d=>({...d,clientStatus:filteredStatuses!.get(d._id)})):await nativeDirectoryStatuses(db,profiles));
 return {clients,stats:{total:all.size,assigned:assignedCount,unassigned:all.size-assignedCount},pagination:{page,limit,total,pages:Math.ceil(total/limit),hasMore:page*limit<total}};
}
