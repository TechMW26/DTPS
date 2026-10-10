import {MongoClient,type Db} from 'mongodb';
import {randomBytes} from 'node:crypto';
let mockDb:Db;
jest.mock('@/lib/db/mongo-native',()=>({getMongoDatabase:async()=>mockDb}));
const uri=process.env.MONGODB_TEST_URI;
const mongoSuite=uri?describe:describe.skip;
const databaseName='dtps_dashboard_'+randomBytes(5).toString('hex');
let client:MongoClient;
const envelope=(collection:string,id:string,data:Record<string,any>)=>({_id:collection+'/'+id,_collectionPath:collection,data});
import {indexedDashboardScope} from '@/lib/db/repository/native-dashboard-indexed';
mongoSuite('Mongo dashboard assignment union',()=>{

 beforeAll(async()=>{client=new MongoClient(uri!,{serverSelectionTimeoutMS:5000});await client.connect();mockDb=client.db(databaseName);});
 afterAll(async()=>{if(client){if(mockDb)await mockDb.dropDatabase();await client.close();}});
 beforeEach(async()=>{for(const collection of await mockDb.collections())await collection.deleteMany({});delete process.env.MONGODB_DASHBOARD_SUMMARIES_ENABLED;});

 it.each([false,true])('includes primary and secondary assignments without unrelated clients, health=%s',async health=>{
  const primary=health?'assignedHealthCounselor':'assignedDietitian',secondary=health?'assignedHealthCounselors':'assignedDietitians';
  await mockDb.collection<any>('users').insertMany([envelope('users','primary',{role:'client',[primary]:'staff'}),envelope('users','shared',{role:'client',[primary]:'staff',[secondary]:['staff']}),envelope('users','secondary',{role:'client',[secondary]:['staff']}),envelope('users','outside',{role:'client',[primary]:'other'}),envelope('users','not-client',{role:'admin',[primary]:'staff'})]);
  expect(new Set(await indexedDashboardScope('staff',health,false,false))).toEqual(new Set(['primary','shared','secondary']));
 });
 test('honors mixed health assignments and created-by option',async()=>{
  await mockDb.collection<any>('users').insertMany([envelope('users','created',{role:'client',createdBy:{userId:'staff'}}),envelope('users','health',{role:'client',assignedHealthCounselors:['staff']}),envelope('users','dietitian',{role:'client',assignedDietitian:'staff'})]);
  expect(new Set(await indexedDashboardScope('staff',false,true))).toEqual(new Set(['created','health','dietitian']));
  expect(await indexedDashboardScope('staff',false,false,false)).toEqual(['dietitian']);
  expect(await indexedDashboardScope(null,false,false,false)).toHaveLength(3);
 });
});
