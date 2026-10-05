import {dashboardSummaryKey,persistentDashboardSummary} from './persistent-dashboard-summary';
import {Firestore,Pipelines,Timestamp} from '@google-cloud/firestore';
import {getNativeDatabase,nativeDatabaseSettings} from '@/lib/db/firestore-native';

// These indexes are managed in firestore.native.indexes.json on the verified
// Enterprise database. Plan and dashboard projections are covered, avoiding
// large meal-plan document reads. Directory payment status fields also fetch
// primary records, as noted below.
const specs={
 pendingPlans:{collection:'clientmealplans',index:'CICAgJjmiJEJ',relation:'clientId',fields:['clientId','name','startDate','endDate','status','isDeleted']},
 pendingPurchases:{collection:'unifiedpayments',index:'CICAgLiT6MEI',relation:'client',fields:'client planName durationDays durationLabel startDate endDate expectedStartDate expectedEndDate mealPlanCreated daysUsed remainingDays linkedMealPlanIds parentPaymentId status paymentStatus finalAmount amount paymentLink otherPlatformPayment razorpayOrderId razorpayPaymentId razorpayPaymentLinkId transactionId stripePaymentIntentId createdAt updatedAt'.split(' ')},
 plans:{collection:'clientmealplans',index:'CICAgJjmiJEJ',relation:'clientId',fields:['clientId','status','name','startDate','endDate','isDeleted']},
 // Directory status fields require primary-record reads; batching still avoids
 // hundreds of small RPCs without scanning payments outside the authorized IDs.
 directoryPayments:{collection:'unifiedpayments',index:'CICAgLiT6MEI',relation:'client',fields:['client','planName','status','paymentStatus','expectedEndDate','endDate']},
 payments:{collection:'unifiedpayments',index:'CICAgLiT6MEI',relation:'client',fields:['client','status','amount','currency','planName','planCategory','durationDays','durationLabel','transactionId','createdAt','expectedEndDate']},
} as const;
let database:Firestore|undefined;
function pipelineDatabase(){
 const settings=nativeDatabaseSettings();
 if(settings.emulator)throw new Error('Enterprise pipelines are not supported by the local emulator');
 return database??=new Firestore({projectId:settings.projectId,databaseId:settings.databaseId,credentials:{client_email:settings.clientEmail,private_key:settings.privateKey}});
}

export async function indexedDashboardClients(clientIds:string[]){
 const db=pipelineDatabase(),allowed=new Set(clientIds);
 const result=await (db as Firestore & {pipeline():Pipelines.PipelineSource}).pipeline()
  .collection({collection:'users',forceIndex:'CICAgLiIjZIK'})
  .where(Pipelines.field('role').equal('client'))
  .select('clientStatus','status','createdAt','dateOfBirth','anniversary',
   Pipelines.field('holdStatus.isOnHold').as('isOnHold'),Pipelines.field('__name__').documentId().as('_id'))
  .limit(50001).execute();
 if(result.results.length>=50001)return null;
 return result.results.filter(row=>allowed.has(row.get('_id'))).map(row=>{
  const data=Object.fromEntries(Object.entries(row.data()).map(([key,value])=>[key,value instanceof Timestamp?value.toDate():value]));
  data.holdStatus={isOnHold:data.isOnHold};delete data.isOnHold;return data;
 });
}

export async function hydrateDashboardClientDetails(clients:FirebaseFirestore.DocumentData[],ids:string[]){
 const byId=new Map(clients.map(client=>[client._id,client])),unique=[...new Set(ids)].filter(id=>byId.has(id));
 const db=getNativeDatabase();let next=0;
 await Promise.all(Array.from({length:Math.min(4,Math.ceil(unique.length/100))},async()=>{
  for(;;){const i=next++*100;if(i>=unique.length)return;
   const rows=await db.getAll(...unique.slice(i,i+100).map(id=>db.collection('users').doc(id)),{fieldMask:['firstName','lastName','email','phone','avatar','clientId','assignedDietitian']});
   for(const row of rows)if(row.exists)Object.assign(byId.get(row.id)!,row.data());
  }
 }));
}

export async function indexedDashboardScope(staff:string|null|undefined,health:boolean,includeHealth:boolean,includeCreated=true){
 const db=pipelineDatabase();
 const indexes:Record<string,string>={assignedDietitian:'CICAgLjyrJEK',assignedDietitians:'CICAgLjRnZMJ',assignedHealthCounselor:'CICAgPig2YMJ',assignedHealthCounselors:'CICAgJjFvYoJ','createdBy.userId':'CICAgNjpgYIJ'};
 const fields=health?['assignedHealthCounselor','assignedHealthCounselors']:['assignedDietitian','assignedDietitians',...(includeHealth?['assignedHealthCounselor','assignedHealthCounselors']:[])];
 if(includeCreated)fields.push('createdBy.userId');
 const results=await Promise.all((staff?fields:['role']).map(async field=>{
  // Enterprise does not allow forcing a multikey (array-contains) index.
  // Query that branch separately through Core; do not turn the whole OR into
  // a table scan or drop secondary assignments.
  if(staff&&field.endsWith('s')){
   const rows=await getNativeDatabase().collection('users').where('role','==','client').where(field,'array-contains',staff).select().get();
   return rows.docs.map(row=>row.id);
  }
  let query=(db as Firestore & {pipeline():Pipelines.PipelineSource}).pipeline().collection({collection:'users',forceIndex:staff?indexes[field]:'CICAgLiIjZIK'}).where(Pipelines.field('role').equal('client'));
  if(staff)query=query.where(field.endsWith('s')?Pipelines.field(field).arrayContains(staff):Pipelines.field(field).equal(staff));
  return (await query.select(Pipelines.field('__name__').documentId().as('_id')).execute()).results.map(row=>row.get('_id') as string);
 }));
 return [...new Set(results.flat())];
}

export async function indexedDashboardRows(kind:keyof typeof specs,clientIds:string[],allowDenseScan=false,activePlansOnly=true,planNameTerms:string[]=[]){
 const ids=[...new Set(clientIds)];if(!ids.length)return [];
 const db=pipelineDatabase(),spec=specs[kind],batchSize=300;
 const source=()=>{
  let query=(db as Firestore & {pipeline():Pipelines.PipelineSource}).pipeline().collection({collection:spec.collection,forceIndex:spec.index});
  if(kind==='pendingPlans')query=query.where(Pipelines.field('status').equalAny(['active','paused','completed']));
  if(kind==='pendingPurchases')query=query.where(Pipelines.field('status').equalAny(['active','paid','completed']));
  if(kind==='plans'&&planNameTerms.length){
   const name=Pipelines.field('name'),isString=name.type().equal('string');
   const lower=Pipelines.toLower(Pipelines.conditional(isString,name,Pipelines.constant('')));
   // Pass legacy non-string names through for the existing JS String conversion.
   // The final client predicate remains authoritative for matching and permissions.
   const matches=planNameTerms.map(term=>Pipelines.stringContains(lower,term));
   query=query.where(Pipelines.or(Pipelines.not(isString),matches[0],...matches.slice(1)));
  }
  return query;
 };
 const project=(query:Pipelines.Pipeline)=>query.select(spec.fields[0],...spec.fields.slice(1),Pipelines.field('__name__').documentId().as('_id'));
 const decode=(row:Pipelines.PipelineResult)=>Object.fromEntries(Object.entries(row.data()).map(([key,value])=>[key,value instanceof Timestamp?value.toDate():value]));
 if((kind==='plans'||kind==='payments'||kind==='pendingPlans')&&allowDenseScan&&ids.length>=3000&&ids.length<=10000){
  // For accounts owning most clients, one bounded covering-index read avoids
  // thousands of index seeks. Only projected index fields are fetched. Enforce
  // the fresh authorized scope before returning anything to the caller.
  let query=source();if(kind==='plans'&&activePlansOnly)query=query.where(Pipelines.field('status').equal('active'));
  const result=await project(query).limit(50001).execute();
  if(result.results.length<50001){const allowed=new Set(ids);return result.results.filter(row=>allowed.has(row.get(spec.relation))).map(decode);}
  // Never truncate metrics as the database grows. Fall back to scoped queries.
 }
 const batches:FirebaseFirestore.DocumentData[][]=[];let next=0;
 // Keep membership below Pipeline's 3,000-element limit and at most three
 // RPCs in flight even as staff assignments grow.
 await Promise.all(Array.from({length:Math.min(3,Math.ceil(ids.length/batchSize))},async()=>{
  for(;;){const slot=next++,batch=ids.slice(slot*batchSize,(slot+1)*batchSize);if(!batch.length)return;
   // firebase-admin also declares the older Firestore ambient class. The
   // dedicated 8.x runtime above supports PipelineSource regardless of that.
   let query=source().where(Pipelines.field(spec.relation).equalAny(batch));
   if(kind==='plans'&&activePlansOnly)query=query.where(Pipelines.field('status').equal('active'));
   const result=await project(query).execute();
   // This SDK has its own Timestamp class, separate from firebase-admin's SDK.
   batches[slot]=result.results.map(decode);
  }
 }));
 return batches.flat();
}

async function cachedAggregate<T>(collection:'clientmealplans'|'unifiedpayments',ids:string[],load:()=>Promise<T>):Promise<T>{
 if(process.env.FIRESTORE_DASHBOARD_SUMMARIES_ENABLED!=='true')return load();
 const key=dashboardSummaryKey([collection,[...new Set(ids)].sort()]);
 return persistentDashboardSummary(getNativeDatabase(),collection,key,load);
}

export async function indexedDashboardPlanSummary(clientIds:string[],start:Date,end:Date,allowDenseScan=false,includeDetails=true){
 const ids=[...new Set(clientIds)],allowed=new Set(ids);
 if(!ids.length)return {activeClientIds:[],expiringPlans:[]};
 const dense=allowDenseScan&&ids.length>=3000&&ids.length<=10000;
 // Small detail dashboards need these records anyway; extra aggregates cost more RPCs.
 if(dense||!includeDetails&&ids.length<=300){
  const db=pipelineDatabase(),spec=specs.plans;
  const source=()=>{
   let query=(db as Firestore & {pipeline():Pipelines.PipelineSource}).pipeline()
    .collection({collection:spec.collection,forceIndex:spec.index})
    .where(Pipelines.field('status').equal('active'))
    .where(Pipelines.field('isDeleted').ifNull(false).notEqual(true));
   if(!dense)query=query.where(Pipelines.field('clientId').equalAny(ids));
   return query;
  };
  const [clients,expiring]=await Promise.all([
   cachedAggregate('clientmealplans',ids,async()=>{const result=await source().distinct('clientId').limit(50001).execute();return result.results.map(row=>row.get('clientId') as string);}),
   includeDetails?source().where(Pipelines.field('endDate').greaterThanOrEqual(start)).where(Pipelines.field('endDate').lessThan(end))
    .select(...spec.fields,Pipelines.field('__name__').documentId().as('_id')).limit(50001).execute():Promise.resolve({results:[]}),
  ]);
  if(clients.length<50001&&expiring.results.length<50001)return {
   activeClientIds:clients.filter(id=>allowed.has(id)),
   expiringPlans:expiring.results.filter(row=>allowed.has(row.get('clientId'))).map(row=>Object.fromEntries(Object.entries(row.data()).map(([key,value])=>[key,value instanceof Timestamp?value.toDate():value]))),
  };
 }
 const plans=(await indexedDashboardRows('plans',ids)).filter(plan=>plan.isDeleted!==true);
 return {activeClientIds:[...new Set(plans.map(plan=>plan.clientId as string))],expiringPlans:includeDetails?plans.filter(plan=>plan.endDate>=start&&plan.endDate<end):[]};
}

export async function indexedDashboardPaymentSummary(clientIds:string[],start:Date,end:Date,allowDenseScan=false,includeDetails=true){
 const ids=[...new Set(clientIds)];
 if(!ids.length)return {groups:[],recentPayments:[],expiredPayments:[]};
 const dense=allowDenseScan&&ids.length>=3000&&ids.length<=10000;
 // Small detail dashboards need these records anyway; extra aggregates cost more RPCs.
 if(dense||!includeDetails&&ids.length<=300){
  const db=pipelineDatabase(),spec=specs.payments;
  const source=()=>(db as Firestore & {pipeline():Pipelines.PipelineSource}).pipeline()
   .collection({collection:spec.collection,forceIndex:spec.index})
   .where(dense?Pipelines.array(ids).arrayContains(Pipelines.field('client')):Pipelines.field('client').equalAny(ids));
  const project=(q:Pipelines.Pipeline)=>q.select(...spec.fields,Pipelines.field('__name__').documentId().as('_id'));
  const [totals,recent,expired]=await Promise.all([
   cachedAggregate('unifiedpayments',ids,async()=>{const result=await source().aggregate({groups:['status',Pipelines.field('amount').ifNull(0).type().as('amountType')],accumulators:[Pipelines.field('amount').sum().as('amount'),Pipelines.field('client').count().as('count')]}).execute();return result.results.map(row=>row.data());}),
   includeDetails?project(source().sort(Pipelines.field('createdAt').descending()).limit(10)).execute():Promise.resolve({results:[]}),
   includeDetails?project(source().where(Pipelines.field('expectedEndDate').greaterThanOrEqual(start)).where(Pipelines.field('expectedEndDate').lessThan(end))).limit(50001).execute():Promise.resolve({results:[]}),
  ]);
  const groups=totals;
  // Legacy string amounts must retain JavaScript Number conversion semantics.
  if(groups.every(row=>['int64','float64'].includes(row.amountType))&&expired.results.length<50001){
   const decode=(row:Pipelines.PipelineResult)=>Object.fromEntries(Object.entries(row.data()).map(([key,value])=>[key,value instanceof Timestamp?value.toDate():value]));
   return {groups,recentPayments:recent.results.map(decode),expiredPayments:expired.results.map(decode)};
  }
 }
 const payments=await indexedDashboardRows('payments',ids,allowDenseScan);
 const summary=summarizeDashboardPayments(payments,start,end);
 return includeDetails?summary:{groups:summary.groups,recentPayments:[],expiredPayments:[]};
}

export function summarizeDashboardPayments(payments:FirebaseFirestore.DocumentData[],start:Date,end:Date){
 const totals=new Map<string,{status:string,amount:number,count:number}>();
 for(const payment of payments){const group=totals.get(payment.status)||{status:payment.status,amount:0,count:0};group.count++;group.amount+=Number(payment.amount||0);totals.set(payment.status,group);}
 return {groups:[...totals.values()],recentPayments:[...payments].sort((a,b)=>new Date(b.createdAt||0).getTime()-new Date(a.createdAt||0).getTime()).slice(0,10),expiredPayments:payments.filter(payment=>payment.expectedEndDate>=start&&payment.expectedEndDate<end)};
}
