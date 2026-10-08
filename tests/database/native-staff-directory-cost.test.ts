import {nativeStaffDirectory} from '@/lib/db/repository/native-staff-directory';
import {indexedDashboardScope} from '@/lib/db/repository/native-dashboard-indexed';
jest.mock('@/lib/db/repository/native-dashboard-indexed',()=>({indexedDashboardScope:jest.fn()}));

const oldProject=process.env.FIRESTORE_NATIVE_PROJECT_ID,oldEmulator=process.env.FIRESTORE_EMULATOR_HOST;
beforeEach(()=>{process.env.FIRESTORE_NATIVE_PROJECT_ID='dtps-2cbac';delete process.env.FIRESTORE_EMULATOR_HOST;});
afterAll(()=>{
 if(oldProject===undefined)delete process.env.FIRESTORE_NATIVE_PROJECT_ID;else process.env.FIRESTORE_NATIVE_PROJECT_ID=oldProject;
 if(oldEmulator===undefined)delete process.env.FIRESTORE_EMULATOR_HOST;else process.env.FIRESTORE_EMULATOR_HOST=oldEmulator;
});
function database(){
 const count=jest.fn(()=>{throw new Error('Expensive OR count must not run');});
 const staff=[{id:'alpha',data:{firstName:'Alpha',lastName:'Team'}},{id:'beta',data:{firstName:'Beta',lastName:'Team'}}];
 const query:any={where:()=>query,count,select:()=>query,get:async()=>({docs:staff.map(row=>({id:row.id,get:(key:string)=>(row.data as any)[key],data:()=>row.data}))})};
 return {db:{databaseId:'dtps-native-staging',collection:()=>query} as any,count};
}
it.each(['dietitian','health_counselor'] as const)('counts %s assignments using ID-only split scope, excluding creator-only relationships',async role=>{
 const {db,count}=database();
 (indexedDashboardScope as jest.Mock).mockImplementation(async id=>id==='alpha'?['one','two']:[]);
 const result=await nativeStaffDirectory(db,role,'');
 expect(result.map(row=>[row._id,row.clientCount])).toEqual([['alpha',2],['beta',0]]);
 expect(indexedDashboardScope).toHaveBeenCalledWith('alpha',role==='health_counselor',false,false);
 expect(indexedDashboardScope).toHaveBeenCalledWith('beta',role==='health_counselor',false,false);
 expect(count).not.toHaveBeenCalled();
});
it('search excludes nonmatching staff before any assignment reads',async()=>{
 const {db,count}=database();
 (indexedDashboardScope as jest.Mock).mockResolvedValue(['one']);
 const result=await nativeStaffDirectory(db,'dietitian','Alpha Team');
 expect(result.map(row=>row._id)).toEqual(['alpha']);
 expect(indexedDashboardScope).toHaveBeenCalledTimes(1);
 expect(count).not.toHaveBeenCalled();
});
it('an indexed branch failure fails the request rather than reporting a false zero',async()=>{
 const {db}=database();
 (indexedDashboardScope as jest.Mock).mockRejectedValue(new Error('index unavailable'));
 await expect(nativeStaffDirectory(db,'dietitian','Alpha')).rejects.toThrow('index unavailable');
});
