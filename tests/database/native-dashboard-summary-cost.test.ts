import {indexedDashboardPlanSummary,indexedDashboardPaymentSummary} from '@/lib/db/repository/native-dashboard-indexed';
const mockCalls:{collection:string;mode:string;conditions:any[]}[]=[];
let mockGroups:any[]=[],mockPlans:any[]=[],mockPayments:any[]=[];
jest.mock('@/lib/db/firestore-native',()=>({nativeDatabaseSettings:()=>({projectId:'test',databaseId:'test',clientEmail:'test',privateKey:'test'})}));
jest.mock('@google-cloud/firestore',()=>{
 const actual=jest.requireActual('@google-cloud/firestore');
 const expression=(name:string):any=>({equalAny:(ids:string[])=>({name,ids}),equal:(value:any)=>({name,value}),ifNull:()=>expression(name),notEqual:(value:any)=>({name,not:value}),greaterThanOrEqual:()=>({}),lessThan:()=>({}),documentId:()=>expression(name),as:()=>({}),type:()=>expression(name),sum:()=>expression(name),count:()=>expression(name),descending:()=>({})});
 return {...actual,Pipelines:{field:expression,array:(ids:string[])=>({arrayContains:()=>({ids})})},Firestore:class{
  pipeline(){return {collection:({collection}:any)=>{
   let mode='rows';const conditions:any[]=[];
   const query:any={where:(condition:any)=>{conditions.push(condition);return query;},select:()=>query,limit:()=>query,sort:()=>query,distinct:()=>{mode='distinct';return query;},aggregate:()=>{mode='aggregate';return query;},execute:async()=>{
    mockCalls.push({collection,mode,conditions});
    const data=mode==='aggregate'?mockGroups:collection==='clientmealplans'?mockPlans:mockPayments;
    return {results:data.map(data=>({data:()=>data,get:(key:string)=>data[key]}))};
   }};return query;
  }};}
 }};
});
const start=new Date('2026-10-01'),end=new Date('2026-10-05');
beforeEach(()=>{mockCalls.length=0;mockGroups=[{status:'completed',amountType:'int64',amount:300,count:2}];mockPlans=[{clientId:'a'}];mockPayments=[];});
test('small authorized scopes aggregate plans and payments without loading unused details',async()=>{
 const plans=await indexedDashboardPlanSummary(['a','a'],start,end,false,false);
 const payments=await indexedDashboardPaymentSummary(['a','a'],start,end,false,false);
 expect(plans).toEqual({activeClientIds:['a'],expiringPlans:[]});
 expect(payments).toEqual({groups:mockGroups,recentPayments:[],expiredPayments:[]});
 expect(mockCalls.map(c=>c.mode)).toEqual(['distinct','aggregate']);
 for(const call of mockCalls)expect(call.conditions).toContainEqual(expect.objectContaining({ids:['a']}));
});
test('detail queries remain enabled for dashboards that display them',async()=>{
 const ids=Array.from({length:3000},(_,i)=>`client-${i}`);
 await indexedDashboardPlanSummary(ids,start,end,true);
 await indexedDashboardPaymentSummary(ids,start,end,true);
 expect(mockCalls.map(c=>c.mode)).toEqual(['distinct','rows','aggregate','rows','rows']);
});
test('empty scopes perform no queries',async()=>{
 expect(await indexedDashboardPlanSummary([],start,end)).toEqual({activeClientIds:[],expiringPlans:[]});
 expect(await indexedDashboardPaymentSummary([],start,end)).toEqual({groups:[],recentPayments:[],expiredPayments:[]});
 expect(mockCalls).toHaveLength(0);
});
test('legacy string amounts fall back to exact JavaScript numeric conversion',async()=>{
 mockGroups=[{status:'completed',amountType:'string',amount:0,count:2}];
 mockPayments=[{status:'completed',amount:'100'},{status:'completed',amount:'20'}];
 const result=await indexedDashboardPaymentSummary(['a'],start,end,false,false);
 expect(result).toEqual({groups:[{status:'completed',amount:120,count:2}],recentPayments:[],expiredPayments:[]});
 expect(mockCalls.map(c=>c.mode)).toEqual(['aggregate','rows']);
});
test('dense summaries filter active client IDs against the authorized scope',async()=>{
 const ids=Array.from({length:3000},(_,i)=>`client-${i}`);
 mockPlans=[{clientId:ids[0]},{clientId:'outside'}];
 const result=await indexedDashboardPlanSummary(ids,start,end,true,false);
 expect(result.activeClientIds).toEqual([ids[0]]);
 expect(mockCalls).toHaveLength(1);
});

test('small detail dashboards reuse row queries instead of adding aggregates',async()=>{
 await indexedDashboardPlanSummary(['a'],start,end);
 await indexedDashboardPaymentSummary(['a'],start,end);
 expect(mockCalls.map(c=>c.mode)).toEqual(['rows','rows']);
});
