import {MongoClient,type Db} from 'mongodb';
import {randomBytes} from 'node:crypto';
let mockDb:Db;
jest.mock('@/lib/db/mongo-native',()=>({getMongoDatabase:async()=>mockDb}));
const uri=process.env.MONGODB_TEST_URI;
const mongoSuite=uri?describe:describe.skip;
const databaseName='dtps_dashboard_'+randomBytes(5).toString('hex');
let client:MongoClient;
const envelope=(collection:string,id:string,data:Record<string,any>)=>({_id:collection+'/'+id,_collectionPath:collection,data});
import {indexedDashboardClients,indexedDashboardRows,hydrateDashboardClientDetails,summarizeDashboardPayments} from '@/lib/db/repository/native-dashboard-indexed';
mongoSuite('Mongo dashboard projected queries',()=>{

 beforeAll(async()=>{client=new MongoClient(uri!,{serverSelectionTimeoutMS:5000});await client.connect();mockDb=client.db(databaseName);});
 afterAll(async()=>{if(client){if(mockDb)await mockDb.dropDatabase();await client.close();}});
 beforeEach(async()=>{for(const collection of await mockDb.collections())await collection.deleteMany({});delete process.env.MONGODB_DASHBOARD_SUMMARIES_ENABLED;});

 test('deduplicates authorized IDs, retains dates and excludes other clients and subcollections',async()=>{
  const ids=Array.from({length:1901},(_,i)=>'client-'+i),endDate=new Date('2026-10-04T00:00:00Z');
  await mockDb.collection<any>('clientmealplans').insertMany([...ids.map(id=>envelope('clientmealplans','p-'+id,{clientId:id,status:'active',endDate,meals:['not projected']})),envelope('clientmealplans','outside',{clientId:'outside',status:'active'}),{...envelope('clientmealplans','nested',{clientId:ids[0],status:'active'}),_collectionPath:'parents/a/clientmealplans'}]);
  const rows=await indexedDashboardRows('plans',[...ids,ids[0]]);
  expect(rows).toHaveLength(ids.length);expect(new Set(rows.map(row=>row.clientId))).toEqual(new Set(ids));
  expect(rows[0].endDate).toEqual(endDate);expect(rows.every(row=>!('meals'in row))).toBe(true);
 });
 test('empty scopes issue no connection or reads',async()=>{
  expect(await indexedDashboardRows('payments',[])).toEqual([]);expect(await indexedDashboardClients([])).toEqual([]);
 });
 test('dense mode still reads only authorized client relations',async()=>{
  await mockDb.collection<any>('clientmealplans').insertMany([envelope('clientmealplans','allowed',{clientId:'one',status:'active'}),envelope('clientmealplans','outside',{clientId:'outside',status:'active'})]);
  expect((await indexedDashboardRows('plans',['one'],true)).map(row=>row._id)).toEqual(['allowed']);
 });
 test('metadata option preserves drafts and history and default filters active',async()=>{
  await mockDb.collection<any>('clientmealplans').insertMany(['active','draft','completed'].map(status=>envelope('clientmealplans',status,{clientId:'one',status,duration:24,purchaseId:'purchase'})));
  expect(await indexedDashboardRows('plans',['one'],false,false)).toHaveLength(3);
  expect((await indexedDashboardRows('plans',['one'])).map(row=>row.status)).toEqual(['active']);
 });
 test('pending scopes retain paused/completed plans and only eligible purchases',async()=>{
  await mockDb.collection<any>('clientmealplans').insertMany(['active','paused','completed','draft'].map(status=>envelope('clientmealplans',status,{clientId:'one',status,duration:24,purchaseId:'purchase'})));
  await mockDb.collection<any>('unifiedpayments').insertMany(['active','paid','completed','pending','failed'].map(status=>envelope('unifiedpayments',status,{client:'one',status})));
  expect((await indexedDashboardRows('pendingPlans',['one'])).map(row=>row.status).sort()).toEqual(['active','completed','paused']);
  expect((await indexedDashboardRows('pendingPurchases',['one'])).map(row=>row.status).sort()).toEqual(['active','completed','paid']);
  expect((await indexedDashboardRows('pendingPlans',['one']))[0]).toMatchObject({duration:24,purchaseId:'purchase'});
 });
 test('name matching treats regex punctuation literally and permits legacy non-string names',async()=>{
  await mockDb.collection<any>('clientmealplans').insertMany(['A+B','AAB',123].map((name,i)=>envelope('clientmealplans','p'+i,{clientId:'one',status:'active',name})));
  expect((await indexedDashboardRows('plans',['one'],false,false,['a+b'])).map(row=>row.name)).toEqual(['A+B',123]);
 });
 test('client summaries query only scope, and hydrate selected display fields without private data',async()=>{
  await mockDb.collection<any>('users').insertMany([envelope('users','one',{role:'client',firstName:'One',password:'secret',holdStatus:{isOnHold:true},createdAt:new Date('2026-10-01')}),envelope('users','other',{role:'client'}),envelope('users','staff',{role:'dietitian'})]);
  const rows=await indexedDashboardClients(['one','staff']);expect(rows).toHaveLength(1);expect(rows[0].holdStatus).toEqual({isOnHold:true});expect(rows[0].firstName).toBeUndefined();
  await hydrateDashboardClientDetails(rows,['one','other']);expect(rows[0].firstName).toBe('One');expect(rows[0].password).toBeUndefined();
 });
 test('directory payments retain all statuses and return projected metadata',async()=>{
  await mockDb.collection<any>('unifiedpayments').insertMany(['paid','pending','failed'].map(status=>envelope('unifiedpayments',status,{client:'one',status,largePayload:'hidden'})));
  const rows=await indexedDashboardRows('directoryPayments',['one'],true);expect(rows).toHaveLength(3);expect(rows.every(row=>!('largePayload'in row))).toBe(true);
 });
 test('large scopes limit reads to three concurrent batches and propagate failures without partial totals',async()=>{
  const real=mockDb,ids=Array.from({length:1901},(_,i)=>'client-'+i);
  let active=0,peak=0,reject=false;const batches:string[][]=[];
  mockDb={collection:()=>({find:(filter:any)=>({toArray:async()=>{
   const batch=filter['data.clientId']?.$in||filter['data.client']?.$in;batches.push(batch);active++;peak=Math.max(peak,active);
   try{await new Promise(resolve=>setTimeout(resolve,2));if(reject)throw new Error('database unavailable');return batch.map((id:string)=>envelope('clientmealplans','p-'+id,{clientId:id,status:'active'}));}finally{active--;}
  }})})} as unknown as Db;
  try{
   expect(await indexedDashboardRows('plans',ids,true)).toHaveLength(ids.length);expect(batches.flat()).toEqual(ids);expect(Math.max(...batches.map(batch=>batch.length))).toBe(300);expect(peak).toBe(3);
   reject=true;await expect(indexedDashboardRows('payments',['one'])).rejects.toThrow('database unavailable');
  }finally{mockDb=real;}
 });
 test('pure payment summary retains legacy numeric strings, status counts and exclusive expiry end',()=>{
  const start=new Date('2026-10-01'),end=new Date('2026-10-05');
  const rows=[{_id:'a',status:'completed',amount:'100',createdAt:start,expectedEndDate:start},{_id:'b',status:'completed',amount:20,createdAt:end,expectedEndDate:end},{_id:'c',status:'pending',amount:null,createdAt:start,expectedEndDate:new Date('2026-10-04')}];
  const result=summarizeDashboardPayments(rows,start,end);expect(result.groups).toEqual([{status:'completed',count:2,amount:120},{status:'pending',count:1,amount:0}]);expect(result.expiredPayments.map(row=>row._id)).toEqual(['a','c']);expect(result.recentPayments[0]._id).toBe('b');
 });
});
