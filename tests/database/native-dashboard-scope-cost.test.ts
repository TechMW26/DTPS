import {dashboardClients} from '@/lib/db/repository/native-staff-dashboard';
import {indexedDashboardClients,indexedDashboardScope} from '@/lib/db/repository/native-dashboard-indexed';

jest.mock('@/lib/db/repository/native-staff-appointments',()=>({nativeAppointmentActor:async()=>({get:(field:string)=>field==='role'?'dietitian':'active'})}));
jest.mock('@/lib/db/repository/native-dashboard-indexed',()=>({indexedDashboardScope:jest.fn(),indexedDashboardClients:jest.fn()}));

test('large authorized dashboards do not count unrelated clients to choose a projection',async()=>{
 const oldProject=process.env.FIRESTORE_NATIVE_PROJECT_ID,oldEmulator=process.env.FIRESTORE_EMULATOR_HOST;
 process.env.FIRESTORE_NATIVE_PROJECT_ID='dtps-2cbac';delete process.env.FIRESTORE_EMULATOR_HOST;
 const count=jest.fn(()=>{throw new Error('Unnecessary global count');});
 const query:any={where:()=>query,count};
 const db:any={databaseId:'dtps-native-staging',collection:()=>query};
 const scope=Array.from({length:3000},(_,index)=>`client-${index}`);
 (indexedDashboardScope as jest.Mock).mockResolvedValue(scope);
 (indexedDashboardClients as jest.Mock).mockResolvedValue([{_id:scope[0],status:'active',createdAt:new Date()}]);
 try{
  const result=await dashboardClients(db,'staff','dietitian');
  expect(result.summaryOnly).toBe(true);
  expect(result.clients.map(client=>client._id)).toEqual([scope[0]]);
  expect(indexedDashboardClients).toHaveBeenCalledWith(scope);
  expect(count).not.toHaveBeenCalled();
 }finally{
  if(oldProject===undefined)delete process.env.FIRESTORE_NATIVE_PROJECT_ID;else process.env.FIRESTORE_NATIVE_PROJECT_ID=oldProject;
  if(oldEmulator===undefined)delete process.env.FIRESTORE_EMULATOR_HOST;else process.env.FIRESTORE_EMULATOR_HOST=oldEmulator;
 }
});
