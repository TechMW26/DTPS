import {Filter,type Firestore,type DocumentData} from 'firebase-admin/firestore';
import {nativeDates} from './native-plan-editor';
import {directoryFields,nativeDirectoryProfile,populateNativeDirectory,nativeDirectoryStatuses,NativeDirectoryError} from './native-client-directory';
import {indexedDashboardRows} from './native-dashboard-indexed';
import {nativeHabitDay} from './native-habits';
function boundary(value:string|null,end=false){if(!value)return null;if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new NativeDirectoryError('Invalid filter date');const d=new Date(value+`T${end?'23:59:59.999':'00:00:00.000'}+05:30`);if(!Number.isFinite(d.getTime()))throw new NativeDirectoryError('Invalid filter date');return d;}
async function related(db:Firestore,collection:string,field:string,ids:string[],fields:string[],from?:Date|null,to?:Date|null,planNameTerms:string[]=[]){
 if(collection==='clientmealplans'&&!from&&!to&&process.env.FIRESTORE_NATIVE_PROJECT_ID==='dtps-2cbac'&&db.databaseId==='dtps-native-staging'&&!process.env.FIRESTORE_EMULATOR_HOST){
  // This index includes drafts and history; dashboard-only active filtering must be disabled.
  const uniqueIds=[...new Set(ids)];
  return indexedDashboardRows('plans',uniqueIds,false,false,planNameTerms);
 }
 if(ids.length>=300&&collection==='unifiedpayments'&&field==='client'&&!from&&!to&&process.env.FIRESTORE_NATIVE_PROJECT_ID==='dtps-2cbac'&&db.databaseId==='dtps-native-staging'&&!process.env.FIRESTORE_EMULATOR_HOST)return indexedDashboardRows('directoryPayments',ids);
 const result:DocumentData[][]=[],uniqueIds=[...new Set(ids)];let next=0;
 await Promise.all(Array.from({length:Math.min(6,Math.ceil(uniqueIds.length/30))},async()=>{
  for(;;){const slot=next++,i=slot*30;if(i>=uniqueIds.length)return;
   let q:FirebaseFirestore.Query=db.collection(collection).where(field,'in',uniqueIds.slice(i,i+30));
   if(from)q=q.where('createdAt','>=',from);if(to)q=q.where('createdAt','<=',to);if(!from&&!to)q=q.orderBy(field);
   const docs=await q.select(...fields).get();result[slot]=docs.docs.map(d=>({_id:d.id,...nativeDates(d.data())}));
  }
 }));return result.flat();
}

export async function nativeUserClientList(db:Firestore,actorId:string,p:URLSearchParams){
 const actor=await db.collection('users').doc(actorId).get();if(actor.get('status')!=='active'||!['admin','dietitian','health_counselor'].includes(actor.get('role')))throw new NativeDirectoryError('Staff access required',403);let effectiveId=actorId,effectiveRole=actor.get('role');if(p.get('viewAs')){if(effectiveRole!=='admin')throw new NativeDirectoryError('Only administrators may use staff view',403);const id=p.get('viewAs')!;if(!/^[a-f0-9]{24}$/i.test(id))throw new NativeDirectoryError('Invalid staff ID');const target=await db.collection('users').doc(id).get();if(!target.exists||!['dietitian','health_counselor'].includes(target.get('role')))throw new NativeDirectoryError('Staff member not found',404);effectiveId=id;effectiveRole=target.get('role');}
 const page=Number(p.get('page')||1),limit=Math.min(100,Number(p.get('limit')||100));if(!Number.isSafeInteger(page)||page<1||!Number.isSafeInteger(limit)||limit<1)throw new NativeDirectoryError('Invalid pagination');let q:FirebaseFirestore.Query=db.collection('users').where('role','==','client');if(effectiveRole!=='admin'){const primary=effectiveRole==='dietitian'?'assignedDietitian':'assignedHealthCounselor',secondary=effectiveRole==='dietitian'?'assignedDietitians':'assignedHealthCounselors';q=q.where(Filter.or(Filter.where(primary,'==',effectiveId),Filter.where(secondary,'array-contains',effectiveId)));}
 for(const [parameter,field,op] of [['primaryDietitian','assignedDietitian','=='],['secondaryDietitian','assignedDietitians','array-contains'],['tagId','tags','array-contains']] as const){const value=p.get(parameter);if(value){if(!/^[a-f0-9]{24}$/i.test(value))throw new NativeDirectoryError('Invalid filter ID');q=q.where(field,op,value);}}
 const dates=Object.fromEntries(['dtAssignedFrom','dtAssignedTo','hcAssignedFrom','hcAssignedTo','planDurationFrom','planDurationTo','lastActivityHCFrom','lastActivityHCTo','lastActivityDTFrom','lastActivityDTTo'].map(k=>[k,boundary(p.get(k),k.endsWith('To'))]));
 const search=(p.get('search')||'').trim().toLowerCase(),status=p.get('status'),planName=(p.get('planName')||'').trim().toLowerCase(),duration=p.get('planDuration'),planStatus=p.get('planStatus'),shared=p.get('planShared');
 // Request-local reuse keeps filtering and visible rows consistent without a stale cache.
 let filteredPlans:DocumentData[]|undefined,loadedPayments:DocumentData[]|undefined,filteredStatuses:Map<string,string>|undefined;
 const needsFilter=search||status||planName||duration||planStatus||shared||Object.values(dates).some(Boolean);let rows:DocumentData[],total:number;
 if(!needsFilter){const [count,docs]=await Promise.all([q.count().get(),q.orderBy('firstName').orderBy('lastName').offset((page-1)*limit).limit(limit).select(...directoryFields).get()]);total=count.data().count;rows=docs.docs.map(d=>nativeDirectoryProfile(d.id,d.data()));}
 else{
  // Candidate filtering only needs names, search fields, and status inputs.
  // Fetch the full directory projection after pagination, never assignment arrays
  // or the entire hold-history object for every matching client.
  const candidateFields=['firstName','lastName','role','holdStatus.isOnHold'];
  if(search)candidateFields.push('email','phone','clientId');
  if(dates.dtAssignedFrom||dates.dtAssignedTo)candidateFields.push('assignedDietitian','createdAt');
  if(dates.hcAssignedFrom||dates.hcAssignedTo)candidateFields.push('assignedHealthCounselor','createdAt');
  const candidate=await q.select(...new Set(candidateFields)).get();rows=candidate.docs.map(d=>({_id:d.id,...nativeDates(d.data())}));
  rows=rows.filter(d=>{for(const [prefix,field] of [['dt','assignedDietitian'],['hc','assignedHealthCounselor']]){const from=dates[prefix+'AssignedFrom'],to=dates[prefix+'AssignedTo'];if((from||to)&&(!d[field]||!d.createdAt||from&&d.createdAt<from||to&&d.createdAt>to))return false;}return true;});
  if(planName||search||duration||planStatus||shared){const ids=rows.map(d=>d._id);
   const nameOnly=!!(planName||search)&&!duration&&!planStatus&&!shared;
   const nameTerms=nameOnly?[...new Set([planName,search].filter(Boolean))]:[];
   const [plans,payments]=await Promise.all([
    related(db,'clientmealplans','clientId',ids,['clientId','name','status','startDate','endDate','isDeleted'],undefined,undefined,nameTerms),
    planName||search?related(db,'unifiedpayments','client',ids,['client','planName','status','paymentStatus','expectedEndDate','endDate']):Promise.resolve([]),
   ]);if(!nameOnly)filteredPlans=plans;if(planName||search)loadedPayments=payments;
   const byClient=new Map<string,DocumentData[]>(),paymentNames=new Map<string,string[]>();
   for(const plan of plans)if(!plan.isDeleted){const group=byClient.get(plan.clientId)||[];group.push(plan);byClient.set(plan.clientId,group);}
   for(const payment of payments){const names=paymentNames.get(payment.client)||[];names.push(String(payment.planName||'').toLowerCase());paymentNames.set(payment.client,names);}
   const nameMatch=(id:string,name:string)=>(byClient.get(id)||[]).some(d=>String(d.name||'').toLowerCase().includes(name))||(paymentNames.get(id)||[]).some(value=>value.includes(name));const today=nativeHabitDay(undefined).start;
   rows=rows.filter(d=>{const plans=byClient.get(d._id)||[];if(planName&&!nameMatch(d._id,planName))return false;if(search&&!['_id','firstName','lastName','email','phone','clientId'].some(k=>String(d[k]||'').toLowerCase().includes(search))&&!`${d.firstName||''} ${d.lastName||''}`.toLowerCase().includes(search)&&!nameMatch(d._id,search))return false;if(duration==='ongoing'&&!plans.some(d=>d.status==='active'&&d.endDate>=today))return false;if(duration==='dateRange'&&!plans.some(d=>(!dates.planDurationFrom||d.startDate>=dates.planDurationFrom)&&(!dates.planDurationTo||d.endDate<=dates.planDurationTo)))return false;if(planStatus&&!plans.some(d=>d.status===planStatus))return false;const hasShared=plans.some(d=>d.status!=='draft');if(shared==='yes'&&!hasShared||shared==='no'&&hasShared)return false;return true;});
  }
  for(const [prefix,staffRole] of [['HC','health_counselor'],['DT','dietitian']]){const from=dates['lastActivity'+prefix+'From'],to=dates['lastActivity'+prefix+'To'];if(from||to){const staff=await db.collection('users').where('role','==',staffRole).select().get(),staffIds=new Set(staff.docs.map(d=>d.id)),messages=await related(db,'messages','receiver',rows.map(d=>d._id),['receiver','sender','createdAt'],from,to),matches=new Set(messages.filter(d=>staffIds.has(d.sender)).map(d=>d.receiver));rows=rows.filter(d=>matches.has(d._id));}}
  if(status){rows=await nativeDirectoryStatuses(db,rows,loadedPayments);filteredStatuses=new Map(rows.map(row=>[row._id,row.clientStatus]));rows=rows.filter(d=>d.clientStatus===status);}rows.sort((a,b)=>`${a.firstName||''} ${a.lastName||''}`.localeCompare(`${b.firstName||''} ${b.lastName||''}`)||a._id.localeCompare(b._id));total=rows.length;const ids=rows.slice((page-1)*limit,page*limit).map(d=>d._id);rows=ids.length?(await db.getAll(...ids.map(id=>db.collection('users').doc(id)),{fieldMask:[...directoryFields]})).filter(d=>d.exists).map(d=>nativeDirectoryProfile(d.id,d.data()!)):[];
 }
 const pageIds=new Set(rows.map(row=>row._id));
 const [plans,statusRows,populatedRows]=await Promise.all([
  filteredPlans?Promise.resolve(filteredPlans.filter(plan=>pageIds.has(plan.clientId))):related(db,'clientmealplans','clientId',rows.map(d=>d._id),['clientId','name','status','startDate','endDate','isDeleted']),
  filteredStatuses?Promise.resolve(rows.map(row=>({...row,clientStatus:filteredStatuses!.get(row._id)}))):nativeDirectoryStatuses(db,rows,loadedPayments),
  populateNativeDirectory(db,rows),
 ]);
 const today=nativeHabitDay(undefined).start;
 rows=populatedRows.map((row,i)=>({...row,clientStatus:statusRows[i].clientStatus}));
 const plansByClient=new Map<string,DocumentData[]>();
 for(const plan of plans)if(!plan.isDeleted){const group=plansByClient.get(plan.clientId)||[];group.push(plan);plansByClient.set(plan.clientId,group);}
 for(const row of rows){const clientPlans=(plansByClient.get(row._id)||[]).sort((a,b)=>new Date(a.startDate).getTime()-new Date(b.startDate).getTime()),last=clientPlans.at(-1),active=clientPlans.find(p=>p.status==='active'&&p.endDate>=today);Object.assign(row,{programStart:clientPlans[0]?.startDate||null,programEnd:last?.endDate||null,lastDiet:last?.name||null,mealPlanStartDate:active?.startDate||null,mealPlanEndDate:active?.endDate||null,activePlanName:active?.name||null});}
 const tags=[...new Set<string>(rows.flatMap(d=>d.tags||[]))],tagMap=new Map<string,DocumentData>();if(tags.length)for(let i=0;i<tags.length;i+=100)for(const t of await db.getAll(...tags.slice(i,i+100).map(id=>db.collection('tags').doc(id)),{fieldMask:['name','color','icon']}))if(t.exists)tagMap.set(t.id,{_id:t.id,...t.data()});for(const row of rows)row.tags=(row.tags||[]).map((id:string)=>tagMap.get(id)).filter(Boolean);
 return {clients:rows,pagination:{page,limit,total,pages:Math.ceil(total/limit)}};
}
