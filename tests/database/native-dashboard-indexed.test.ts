import {indexedDashboardRows,summarizeDashboardPayments} from '@/lib/db/repository/native-dashboard-indexed';
import {Timestamp} from '@google-cloud/firestore';

const mockBatches:string[][]=[];
let mockActive=0,mockPeak=0,mockReject=false;
let mockDenseIds:string[]=[];
const mockLimits:number[]=[];
let mockActiveFilters=0;
jest.mock('@/lib/db/firestore-native',()=>({nativeDatabaseSettings:()=>({projectId:'test',databaseId:'test',clientEmail:'test',privateKey:'test'})}));
jest.mock('@google-cloud/firestore',()=>{
 const actual=jest.requireActual('@google-cloud/firestore');
 return {...actual,Firestore:class{
  pipeline(){return {collection:()=>{
   let ids:string[]=[];
   const query:any={where:(condition:any)=>{if(condition.ids)ids=condition.ids;if(condition.equals==='active')mockActiveFilters++;return query;},select:()=>query,limit:(n:number)=>{mockLimits.push(n);return query;},execute:async()=>{
    mockBatches.push(ids);mockActive++;mockPeak=Math.max(mockPeak,mockActive);
    try{await new Promise(r=>setTimeout(r,2));if(mockReject)throw new Error('index unavailable');return {results:(ids.length?ids:mockDenseIds).map(id=>({get:()=>id,data:()=>({_id:`plan-${id}`,clientId:id,endDate:actual.Timestamp.fromDate(new Date('2026-10-04T00:00:00Z'))})}))};}finally{mockActive--;}
   }};return query;
  }};}
 },Pipelines:{field:()=>({equalAny:(ids:string[])=>({ids}),equal:(value:string)=>({equals:value}),documentId:()=>({as:()=>({})})})}};
});
beforeEach(()=>{mockActiveFilters=0;mockBatches.length=0;mockLimits.length=0;mockDenseIds=[];mockActive=0;mockPeak=0;mockReject=false;});

test('indexed dashboard requests only authorized IDs, deduplicates, and retains IDs and dates',async()=>{
 const ids=Array.from({length:1901},(_,i)=>`client-${i}`);
 const rows=await indexedDashboardRows('plans',[...ids,ids[0]]);
 expect(mockBatches.flat()).toEqual(ids);
 expect(Math.max(...mockBatches.map(b=>b.length))).toBe(300);
 expect(mockPeak).toBe(3);
 expect(rows.map(r=>r._id)).toEqual(ids.map(id=>`plan-${id}`));
 expect(rows[0].endDate).toEqual(new Date('2026-10-04T00:00:00Z'));
 expect(rows[0].endDate).not.toBeInstanceOf(Timestamp);
});
test('empty access scope issues no database reads',async()=>{
 expect(await indexedDashboardRows('payments',[])).toEqual([]);
 expect(mockBatches).toHaveLength(0);
});
test('query failure does not return incomplete totals',async()=>{
 mockReject=true;
 await expect(indexedDashboardRows('payments',['one'])).rejects.toThrow('index unavailable');
});
test('dense index reads exclude every client outside the authorized scope',async()=>{
 const ids=Array.from({length:3000},(_,i)=>`client-${i}`);
 mockDenseIds=[ids[0],'outside-scope',ids[1]];
 const rows=await indexedDashboardRows('plans',ids,true);
 expect(rows.map(r=>r.clientId)).toEqual(ids.slice(0,2));
 expect(mockLimits).toEqual([50001]);
});
test('dense read cap falls back to complete scoped queries, never truncated totals',async()=>{
 const ids=Array.from({length:3000},(_,i)=>`client-${i}`);
 mockDenseIds=Array(50001).fill('outside-scope');
 const rows=await indexedDashboardRows('plans',ids,true);
 expect(rows.map(r=>r.clientId)).toEqual(ids);
 expect(mockBatches).toHaveLength(11);
});
test('payment summary retains legacy numeric strings, status counts and expiry boundaries',()=>{
 const start=new Date('2026-10-01T00:00:00Z'),end=new Date('2026-10-05T00:00:00Z');
 const rows=[
  {_id:'a',status:'completed',amount:'100',createdAt:start,expectedEndDate:start},
  {_id:'b',status:'completed',amount:20,createdAt:end,expectedEndDate:end},
  {_id:'c',status:'pending',amount:null,createdAt:start,expectedEndDate:new Date('2026-10-04T00:00:00Z')},
 ];
 const summary=summarizeDashboardPayments(rows,start,end);
 expect(summary.groups).toEqual([{status:'completed',count:2,amount:120},{status:'pending',count:1,amount:0}]);
 expect(summary.expiredPayments.map(row=>row._id)).toEqual(['a','c']);
 expect(summary.recentPayments[0]._id).toBe('b');
 expect(rows[0]._id).toBe('a');
});

test('client-list metadata reads include drafts and history rather than filtering to active plans',async()=>{
 await indexedDashboardRows('plans',['one'],false,false);
 expect(mockActiveFilters).toBe(0);
 await indexedDashboardRows('plans',['one']);
 expect(mockActiveFilters).toBe(1);
});

test('directory payment batching preserves the full authorized scope and does not apply active-plan filtering',async()=>{
 const ids=Array.from({length:1501},(_,i)=>`client-${i}`);
 const rows=await indexedDashboardRows('directoryPayments',ids,true);
 expect(rows).toHaveLength(ids.length);
 expect(mockBatches.flat()).toEqual(ids);
 expect(mockActiveFilters).toBe(0);
 expect(mockLimits).toEqual([]);
 expect(mockPeak).toBe(3);
});
