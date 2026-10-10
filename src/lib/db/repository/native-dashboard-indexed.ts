import {createHash} from 'node:crypto';
import type {Document} from 'mongodb';
import {getMongoDatabase} from '@/lib/db/mongo-native';

// Query relationship indexes and project only the metadata needed by the dashboard.
const specs={
 pendingPlans:{collection:'clientmealplans',relation:'clientId',fields:['clientId','name','startDate','endDate','duration','status','purchaseId','isDeleted']},
 pendingPurchases:{collection:'unifiedpayments',relation:'client',fields:'client planName durationDays durationLabel startDate endDate expectedStartDate expectedEndDate mealPlanCreated daysUsed remainingDays linkedMealPlanIds parentPaymentId status paymentStatus finalAmount amount paymentLink otherPlatformPayment razorpayOrderId razorpayPaymentId razorpayPaymentLinkId transactionId stripePaymentIntentId createdAt updatedAt'.split(' ')},
 plans:{collection:'clientmealplans',relation:'clientId',fields:['clientId','status','name','startDate','endDate','isDeleted']},
 // Directory status fields require primary-record reads; batching still avoids
 // hundreds of small RPCs without scanning payments outside the authorized IDs.
 directoryPayments:{collection:'unifiedpayments',relation:'client',fields:['client','planName','status','paymentStatus','expectedEndDate','endDate']},
 payments:{collection:'unifiedpayments',relation:'client',fields:['client','status','amount','currency','planName','planCategory','durationDays','durationLabel','transactionId','createdAt','expectedEndDate']},
} as const;

type DashboardRow=Record<string,any>;
const BATCH_SIZE=300;
const documentId=(path:string)=>path.split('/').at(-1)!;
const createdAtTypeKey=Buffer.from(JSON.stringify(['createdAt'])).toString('base64url');
// Keep precision metadata private: callers continue receiving Date-valued fields.
const paymentOrdering=new WeakMap<DashboardRow,{nanos:number,path:string}>();
function recentPaymentOrder(a:DashboardRow,b:DashboardRow){
 const aMillis=new Date(a.createdAt||0).getTime(),bMillis=new Date(b.createdAt||0).getTime();
 const aOrder=paymentOrdering.get(a),bOrder=paymentOrdering.get(b);
 const aNanos=aOrder?.nanos??((aMillis%1000+1000)%1000)*1e6,bNanos=bOrder?.nanos??((bMillis%1000+1000)%1000)*1e6;
 const aPath=aOrder?.path||a._id||'',bPath=bOrder?.path||b._id||'';
 return bMillis-aMillis||bNanos-aNanos||(aPath<bPath?1:aPath>bPath?-1:0);
}
function mongoValue(value:any):any {
 if(value instanceof Date||Object.prototype.toString.call(value)==='[object Date]')return new Date(value.getTime());
 if(value&&value._bsontype==='Long')return value.toNumber();
 if(Array.isArray(value))return value.map(mongoValue);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,mongoValue(item)]));
 return value;
}
function decodeRow(row:DashboardRow):DashboardRow{
 const data={...mongoValue(row.data||{}),_id:documentId(row._id)},tag=row._types?.[createdAtTypeKey];
 if(tag?.kind==='timestamp'&&Number.isInteger(tag.nanos))paymentOrdering.set(data,{nanos:tag.nanos,path:row._id});
 return data;
}
const projection=(fields:readonly string[])=>Object.fromEntries([['_id',1],...fields.map(field=>['data.'+field,1]),...(fields.includes('createdAt')?[[`_types.${createdAtTypeKey}`,1]]:[])]);
const rootFilter=(collection:string,filter:Document={})=>({_collectionPath:collection,...filter});

/** Bound concurrent reads and retain deterministic batch order without truncating scopes. */
async function dashboardBatches<T>(ids:string[],load:(batch:string[])=>Promise<T>):Promise<T[]>{
 const results:T[]=[];let next=0;
 await Promise.all(Array.from({length:Math.min(3,Math.ceil(ids.length/BATCH_SIZE))},async()=>{
  for(;;){const slot=next++,batch=ids.slice(slot*BATCH_SIZE,(slot+1)*BATCH_SIZE);if(!batch.length)return;
   results[slot]=await load(batch);
  }
 }));
 return results;
}

export async function indexedDashboardClients(clientIds:string[]):Promise<DashboardRow[]>{
 const ids=[...new Set(clientIds)];if(!ids.length)return [];
 const db=await getMongoDatabase();
 const batches=await dashboardBatches(ids,async batch=>{
  const rows=await db.collection<any>('users').find(rootFilter('users',{'data.role':'client',_id:{$in:batch.map(id=>'users/'+id)}}),
   {projection:projection(['clientStatus','status','createdAt','dateOfBirth','anniversary','holdStatus.isOnHold'])}).toArray();
  return rows.map(decodeRow).map(row=>({...row,holdStatus:{isOnHold:row.holdStatus?.isOnHold}}));
 });
 return batches.flat();
}

export async function hydrateDashboardClientDetails(clients:DashboardRow[],ids:string[]){
 const byId=new Map(clients.map(client=>[client._id,client]));
 const unique=[...new Set(ids)].filter(id=>byId.has(id));if(!unique.length)return;
 const db=await getMongoDatabase();
 await dashboardBatches(unique,async batch=>{
  const rows=await db.collection<any>('users').find(rootFilter('users',{_id:{$in:batch.map(id=>'users/'+id)}}),
   {projection:projection(['firstName','lastName','email','phone','avatar','clientId','assignedDietitian'])}).toArray();
  for(const row of rows)Object.assign(byId.get(documentId(row._id))!,mongoValue(row.data));
 });
}

export async function indexedDashboardScope(staff:string|null|undefined,health:boolean,includeHealth:boolean,includeCreated=true){
 const fields=health?['assignedHealthCounselor','assignedHealthCounselors']:['assignedDietitian','assignedDietitians',...(includeHealth?['assignedHealthCounselor','assignedHealthCounselors']:[])];
 if(includeCreated)fields.push('createdBy.userId');
 const db=await getMongoDatabase();
 // Mongo equality matches both primary scalar IDs and secondary assignment arrays.
 const scope=staff?{$or:fields.map(field=>({['data.'+field]:staff}))}:{};
 const rows=await db.collection<any>('users').find(rootFilter('users',{'data.role':'client',...scope}),{projection:{_id:1}}).toArray();
 return [...new Set(rows.map(row=>documentId(row._id)))];
}

export async function indexedDashboardRows(kind:keyof typeof specs,clientIds:string[],allowDenseScan=false,activePlansOnly=true,planNameTerms:string[]=[]){
 const ids=[...new Set(clientIds)];if(!ids.length)return [];
 const db=await getMongoDatabase(),spec=specs[kind];
 const filters:Document={};
 if(kind==='pendingPlans')filters['data.status']={$in:['active','paused','completed']};
 if(kind==='pendingPurchases')filters['data.status']={$in:['active','paid','completed']};
 if(kind==='plans'&&activePlansOnly)filters['data.status']='active';
 if(kind==='plans'&&planNameTerms.length){
  const patterns=planNameTerms.map(term=>term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
  // Non-string legacy names continue to the caller's authoritative String conversion.
  filters.$or=[{'data.name':{$not:{$type:'string'}}},...patterns.map(pattern=>({'data.name':{$regex:pattern,$options:'i'}}))];
 }
 const batches=await dashboardBatches(ids,async batch=>{
  const rows=await db.collection<any>(spec.collection).find(rootFilter(spec.collection,{...filters,['data.'+spec.relation]:{$in:batch}}),{projection:projection(spec.fields)}).toArray();
  return rows.map(decodeRow);
 });
 return batches.flat();
}

// Reuse aggregates without a provider-trigger dependency. Authorization is resolved
// by callers before this cache; keys include the exact current allowed client IDs.
const aggregateCache=new Map<string,{expiresAt:number,value:unknown}>();
const aggregatePending=new Map<string,Promise<unknown>>();
async function cachedAggregate<T>(collection:'clientmealplans'|'unifiedpayments',ids:string[],load:()=>Promise<T>):Promise<T>{
 if(process.env.MONGODB_DASHBOARD_SUMMARIES_ENABLED!=='true')return load();
 const key=createHash('sha256').update(JSON.stringify([collection,[...new Set(ids)].sort()])).digest('hex'),now=Date.now();
 for(const [key,entry]of aggregateCache)if(entry.expiresAt<=now)aggregateCache.delete(key);
 const entry=aggregateCache.get(key);if(entry)return structuredClone(entry.value) as T;
 const pending=aggregatePending.get(key);if(pending)return structuredClone(await pending) as T;
 const work=(async()=>{const result=await load();if(Date.now()-now<30_000&&Buffer.byteLength(JSON.stringify(result))<=700_000){aggregateCache.set(key,{expiresAt:now+30_000,value:structuredClone(result)});while(aggregateCache.size>32)aggregateCache.delete(aggregateCache.keys().next().value!);}return result;})();
 aggregatePending.set(key,work);try{return await work;}finally{aggregatePending.delete(key);}
}

export async function indexedDashboardPlanSummary(clientIds:string[],start:Date,end:Date,allowDenseScan=false,includeDetails=true){
 const ids=[...new Set(clientIds)],allowed=new Set(ids);
 if(!ids.length)return {activeClientIds:[],expiringPlans:[]};
 if(allowDenseScan||!includeDetails){
  const db=await getMongoDatabase(),collection=db.collection<any>('clientmealplans');
  const filter=(batch:string[])=>rootFilter('clientmealplans',{'data.clientId':{$in:batch},'data.status':'active','data.isDeleted':{$ne:true}});
  const activeClientIds=await cachedAggregate('clientmealplans',ids,async()=>{
   const batches=await dashboardBatches(ids,batch=>collection.distinct('data.clientId',filter(batch)));
   return [...new Set(batches.flat())].filter(id=>allowed.has(id));
  });
  const expiring=includeDetails?await dashboardBatches(ids,async batch=>{
   const rows=await collection.find({...filter(batch),'data.endDate':{$gte:start,$lt:end}},{projection:projection(specs.plans.fields)}).toArray();
   return rows.map(decodeRow).filter(row=>allowed.has(row.clientId));
  }):[];
  return {activeClientIds:activeClientIds.filter(id=>allowed.has(id)),expiringPlans:expiring.flat()};
 }
 const plans=(await indexedDashboardRows('plans',ids)).filter(plan=>plan.isDeleted!==true);
 return {activeClientIds:[...new Set(plans.map(plan=>plan.clientId as string))],expiringPlans:includeDetails?plans.filter(plan=>plan.endDate>=start&&plan.endDate<end):[]};
}

export async function indexedDashboardPaymentSummary(clientIds:string[],start:Date,end:Date,allowDenseScan=false,includeDetails=true){
 const ids=[...new Set(clientIds)];
 if(!ids.length)return {groups:[],recentPayments:[],expiredPayments:[]};
 if(allowDenseScan||!includeDetails){
  const db=await getMongoDatabase(),collection=db.collection<any>('unifiedpayments');
  const filter=(batch:string[])=>rootFilter('unifiedpayments',{'data.client':{$in:batch}});
  const groups=await cachedAggregate('unifiedpayments',ids,async()=>{
   const batches=await dashboardBatches(ids,async batch=>{
    const rows=await collection.aggregate([
     {$match:filter(batch)},
     {$group:{_id:{status:'$data.status',amountType:{$type:{$ifNull:['$data.amount',0]}}},amount:{$sum:{$ifNull:['$data.amount',0]}},count:{$sum:1}}},
     {$project:{_id:0,status:'$_id.status',amountType:'$_id.amountType',amount:1,count:1}},
    ]).toArray();
    return rows.map(row=>({...mongoValue(row),amountType:['int','long'].includes(row.amountType)?'int64':row.amountType==='double'?'float64':row.amountType}));
   });
   const merged=new Map<string,DashboardRow>();
   for(const row of batches.flat()){
    const key=JSON.stringify([row.status,row.amountType]),group=merged.get(key);
    if(group){group.amount+=row.amount;group.count+=row.count;}else merged.set(key,{...row});
   }
   return [...merged.values()];
  });
  if(groups.every(row=>['int64','float64'].includes(row.amountType))){
   if(!includeDetails)return {groups,recentPayments:[],expiredPayments:[]};
   const details=await dashboardBatches(ids,async batch=>{
    const recent=await collection.find(filter(batch),{projection:projection(specs.payments.fields)}).sort({'data.createdAt':-1,[`_types.${createdAtTypeKey}.nanos`]:-1,_id:-1}).limit(10).toArray();
    const expired=await collection.find({...filter(batch),'data.expectedEndDate':{$gte:start,$lt:end}},{projection:projection(specs.payments.fields)}).toArray();
    return {recent:recent.map(decodeRow),expired:expired.map(decodeRow)};
   });
   return {groups,recentPayments:details.flatMap(value=>value.recent).sort(recentPaymentOrder).slice(0,10),expiredPayments:details.flatMap(value=>value.expired)};
  }
 }
 const payments=await indexedDashboardRows('payments',ids);
 const summary=summarizeDashboardPayments(payments,start,end);
 return includeDetails?summary:{groups:summary.groups,recentPayments:[],expiredPayments:[]};
}

export function summarizeDashboardPayments(payments:FirebaseFirestore.DocumentData[],start:Date,end:Date){
 const totals=new Map<string,{status:string,amount:number,count:number}>();
 for(const payment of payments){const group=totals.get(payment.status)||{status:payment.status,amount:0,count:0};group.count++;group.amount+=Number(payment.amount||0);totals.set(payment.status,group);}
 return {groups:[...totals.values()],recentPayments:[...payments].sort(recentPaymentOrder).slice(0,10),expiredPayments:payments.filter(payment=>payment.expectedEndDate>=start&&payment.expectedEndDate<end)};
}
