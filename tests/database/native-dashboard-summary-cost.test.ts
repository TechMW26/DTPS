import {MongoClient,type Db} from 'mongodb';
import {randomBytes} from 'node:crypto';
let mockDb:Db;
jest.mock('@/lib/db/mongo-native',()=>({getMongoDatabase:async()=>mockDb}));
const uri=process.env.MONGODB_TEST_URI;
const mongoSuite=uri?describe:describe.skip;
const databaseName='dtps_dashboard_'+randomBytes(5).toString('hex');
let client:MongoClient;
const envelope=(collection:string,id:string,data:Record<string,any>)=>({_id:collection+'/'+id,_collectionPath:collection,data});
import {indexedDashboardPlanSummary,indexedDashboardPaymentSummary} from '@/lib/db/repository/native-dashboard-indexed';
const start=new Date('2026-10-01'),end=new Date('2026-10-05');
mongoSuite('Mongo scoped dashboard summaries',()=>{

 beforeAll(async()=>{client=new MongoClient(uri!,{serverSelectionTimeoutMS:5000});await client.connect();mockDb=client.db(databaseName);});
 afterAll(async()=>{if(client){if(mockDb)await mockDb.dropDatabase();await client.close();}});
 beforeEach(async()=>{for(const collection of await mockDb.collections())await collection.deleteMany({});delete process.env.MONGODB_DASHBOARD_SUMMARIES_ENABLED;});

 test('summary-only aggregates exclude unauthorized, deleted and inactive plans',async()=>{
  await mockDb.collection<any>('clientmealplans').insertMany([envelope('clientmealplans','a',{clientId:'one',status:'active'}),envelope('clientmealplans','b',{clientId:'one',status:'active',isDeleted:true}),envelope('clientmealplans','c',{clientId:'outside',status:'active'}),envelope('clientmealplans','d',{clientId:'two',status:'draft'})]);
  await mockDb.collection<any>('unifiedpayments').insertMany([envelope('unifiedpayments','a',{client:'one',status:'completed',amount:100}),envelope('unifiedpayments','b',{client:'one',status:'completed',amount:20}),envelope('unifiedpayments','c',{client:'outside',status:'completed',amount:999})]);
  expect(await indexedDashboardPlanSummary(['one','one','two'],start,end,false,false)).toEqual({activeClientIds:['one'],expiringPlans:[]});
  expect(await indexedDashboardPaymentSummary(['one','one'],start,end,false,false)).toEqual({groups:[{status:'completed',amountType:'int64',amount:120,count:2}],recentPayments:[],expiredPayments:[]});
 });
 test('large scope batches combine aggregates without double counting or truncation',async()=>{
  const ids=Array.from({length:601},(_,i)=>'client-'+i);
  await mockDb.collection<any>('unifiedpayments').insertMany(ids.map((id,i)=>envelope('unifiedpayments','p'+i,{client:id,status:'completed',amount:1})));
  const result=await indexedDashboardPaymentSummary(ids,start,end,true,false);expect(result.groups).toEqual([{status:'completed',amountType:'int64',amount:601,count:601}]);
 });
 test('legacy string amounts fall back to exact JavaScript numeric conversion',async()=>{
  await mockDb.collection<any>('unifiedpayments').insertMany([envelope('unifiedpayments','a',{client:'one',status:'completed',amount:'100'}),envelope('unifiedpayments','b',{client:'one',status:'completed',amount:'20'})]);
  expect(await indexedDashboardPaymentSummary(['one'],start,end,false,false)).toEqual({groups:[{status:'completed',amount:120,count:2}],recentPayments:[],expiredPayments:[]});
 });
 test('dense detail query merges latest ten payments globally and expiry bounds remain exclusive',async()=>{
  const ids=Array.from({length:301},(_,i)=>'client-'+i);
  await mockDb.collection<any>('unifiedpayments').insertMany(Array.from({length:15},(_,i)=>envelope('unifiedpayments','p'+i,{client:i<8?ids[0]:ids[300],status:'completed',amount:10,createdAt:new Date(2026,9,i+1),expectedEndDate:i===0?start:i===1?end:new Date('2026-10-04')})));
  const result=await indexedDashboardPaymentSummary(ids,start,end,true);
  expect(result.recentPayments.map(row=>row._id)).toEqual(Array.from({length:10},(_,i)=>'p'+(14-i)));
  expect(result.expiredPayments).toHaveLength(14);expect(result.expiredPayments.find(row=>row._id==='p1')).toBeUndefined();
 });
 test.each([false,true])('same-millisecond payments retain nanosecond order across batches and numeric fallback (strings=%s)',async stringAmounts=>{
  const ids=Array.from({length:301},(_,i)=>'precision-client-'+i),createdAt=new Date('2026-10-01T00:00:00.123Z');
  const key=Buffer.from(JSON.stringify(['createdAt'])).toString('base64url');
  await mockDb.collection<any>('unifiedpayments').insertMany(Array.from({length:15},(_,i)=>({
   ...envelope('unifiedpayments','precision-'+String(14-i).padStart(2,'0'),{client:i%2?ids[0]:ids[300],status:'completed',amount:stringAmounts?'10':10,createdAt}),
   _types:{[key]:{kind:'timestamp',seconds:Math.floor(createdAt.getTime()/1000),nanos:123000000+i*10}},
  })));
  const result=await indexedDashboardPaymentSummary(ids,start,end,true);
  expect(result.recentPayments.map(row=>row._id)).toEqual(Array.from({length:10},(_,i)=>'precision-'+String(i).padStart(2,'0')));
  for(const row of result.recentPayments){expect(row.createdAt).toBeInstanceOf(Date);expect(row.createdAt.getTime()).toBe(createdAt.getTime());expect(Object.keys(row)).not.toContain('_types');}
 });
 test('plan detail summaries preserve active IDs and exclusive end date',async()=>{
  await mockDb.collection<any>('clientmealplans').insertMany([envelope('clientmealplans','first',{clientId:'one',status:'active',endDate:start}),envelope('clientmealplans','end',{clientId:'two',status:'active',endDate:end}),envelope('clientmealplans','deleted',{clientId:'one',status:'active',endDate:start,isDeleted:true})]);
  const result=await indexedDashboardPlanSummary(['one','two'],start,end,true);expect(new Set(result.activeClientIds)).toEqual(new Set(['one','two']));expect(result.expiringPlans.map(row=>row._id)).toEqual(['first']);
 });
 test('small detail summaries preserve row semantics',async()=>{
  await mockDb.collection<any>('unifiedpayments').insertOne(envelope('unifiedpayments','a',{client:'one',status:'pending',amount:12,createdAt:start,expectedEndDate:start}));
  const result=await indexedDashboardPaymentSummary(['one'],start,end);expect(result.groups).toEqual([{status:'pending',count:1,amount:12}]);expect(result.recentPayments[0]._id).toBe('a');expect(result.expiredPayments[0]._id).toBe('a');
 });
 test('optional short aggregate cache coalesces identical scopes without extra database cache writes',async()=>{
  const real=mockDb,collection=mockDb.collection<any>('unifiedpayments');
  await collection.insertOne(envelope('unifiedpayments','cache-payment',{client:'cache-one',status:'completed',amount:10}));
  const aggregate=jest.spyOn(collection,'aggregate');
  mockDb={collection:()=>collection} as unknown as Db;process.env.MONGODB_DASHBOARD_SUMMARIES_ENABLED='true';
  try{
   const [first,second]=await Promise.all([indexedDashboardPaymentSummary(['cache-one'],start,end,false,false),indexedDashboardPaymentSummary(['cache-one','cache-one'],start,end,false,false)]);
   expect(first).toEqual(second);expect(aggregate).toHaveBeenCalledTimes(1);
   expect(await indexedDashboardPaymentSummary(['cache-one'],start,end,false,false)).toEqual(first);expect(aggregate).toHaveBeenCalledTimes(1);
  }finally{aggregate.mockRestore();mockDb=real;delete process.env.MONGODB_DASHBOARD_SUMMARIES_ENABLED;}
 });
 test('empty scopes return empty summaries without requiring provider access',async()=>{
  expect(await indexedDashboardPlanSummary([],start,end)).toEqual({activeClientIds:[],expiringPlans:[]});expect(await indexedDashboardPaymentSummary([],start,end)).toEqual({groups:[],recentPayments:[],expiredPayments:[]});
 });
});
