import {indexedDashboardScope} from '@/lib/db/repository/native-dashboard-indexed';
const mockCalls:any[]=[];
const mockCoreConditions:any[]=[];
jest.mock('@/lib/db/firestore-native',()=>({
 nativeDatabaseSettings:()=>({projectId:'test',databaseId:'test',clientEmail:'test',privateKey:'test'}),
 getNativeDatabase:()=>({collection:()=>{
  const conditions:any[]=[];
  const query:any={where:(...condition:any[])=>{conditions.push(condition);return query;},select:()=>query,get:async()=>{
   mockCoreConditions.push(conditions);return {docs:[{id:'shared'},{id:'secondary-only'}]};
  }};return query;
 }}),
}));
jest.mock('@google-cloud/firestore',()=>{
 const actual=jest.requireActual('@google-cloud/firestore');
 return {...actual,Pipelines:{field:(name:string)=>({equal:(value:any)=>({name,value}),documentId:()=>({as:()=>({})})})},Firestore:class{
  pipeline(){return {collection:(options:any)=>{
   const conditions:any[]=[];
   const query:any={where:(condition:any)=>{conditions.push(condition);return query;},select:()=>query,execute:async()=>{
    mockCalls.push({options,conditions});return {results:['primary-only','shared'].map(id=>({get:()=>id}))};
   }};return query;
  }};}
 }};
});
beforeEach(()=>{mockCalls.length=0;mockCoreConditions.length=0;});
it.each([false,true])('preserves exact union of primary and secondary client IDs, health=%s',async health=>{
 const result=await indexedDashboardScope('staff',health,false,false);
 expect(result).toEqual(['primary-only','shared','secondary-only']);
 expect(mockCalls).toHaveLength(1);
 expect(mockCalls[0].options.forceIndex).toBe(health?'CICAgPig2YMJ':'CICAgLjyrJEK');
 expect(mockCalls[0].conditions).toContainEqual({name:'role',value:'client'});
 expect(mockCalls[0].conditions).toContainEqual({name:health?'assignedHealthCounselor':'assignedDietitian',value:'staff'});
 expect(mockCoreConditions).toEqual([[['role','==','client'],[health?'assignedHealthCounselors':'assignedDietitians','array-contains','staff']]]);
});
