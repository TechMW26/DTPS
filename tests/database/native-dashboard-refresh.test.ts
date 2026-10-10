import {NextRequest} from 'next/server';
import {getServerSession} from 'next-auth';
import {nativeStaffStats,nativePendingPlans} from '@/lib/db/repository/native-staff-dashboard';
import {nativeStaffDashboardRoute} from '@/lib/db/repository/native-staff-dashboard-route';

jest.mock('next-auth',()=>({getServerSession:jest.fn()}));
jest.mock('@/lib/auth/config',()=>({authOptions:{}}));
jest.mock('@/lib/db/database',()=>({getNativeDatabase:()=>({})}));
jest.mock('@/lib/db/repository/native-staff-dashboard',()=>({nativeStaffStats:jest.fn(),nativePendingPlans:jest.fn()}));
jest.mock('@/lib/db/repository/native-staff-client-dashboard',()=>({nativeClientDashboard:jest.fn()}));

const request=(query='')=>new NextRequest(`http://localhost/api/dashboard/test${query}`);
test('overlapping dashboard refreshes share work, but later refreshes read fresh data',async()=>{
 (getServerSession as jest.Mock).mockResolvedValue({user:{id:'actor-a'}});
 (nativeStaffStats as jest.Mock).mockImplementation(async()=>{await new Promise(r=>setTimeout(r,10));return {totalClients:7};});
 const responses=await Promise.all(Array.from({length:5},()=>nativeStaffDashboardRoute(request(),'dietitian')));
 expect(nativeStaffStats).toHaveBeenCalledTimes(1);
 for(const response of responses)expect(await response.json()).toEqual({totalClients:7});
 await nativeStaffDashboardRoute(request(),'dietitian');
 expect(nativeStaffStats).toHaveBeenCalledTimes(2);
});

test('different actors and pending-plan scopes never share results',async()=>{
 (getServerSession as jest.Mock).mockResolvedValueOnce({user:{id:'actor-a'}}).mockResolvedValueOnce({user:{id:'actor-b'}}).mockResolvedValue({user:{id:'actor-a'}});
 (nativePendingPlans as jest.Mock).mockImplementation(async(_db,id,params)=>{await new Promise(r=>setTimeout(r,10));return {actor:id,scope:params.get('dietitianId')};});
 const responses=await Promise.all([
  nativeStaffDashboardRoute(request('?dietitianId=x'),'pending'),
  nativeStaffDashboardRoute(request('?dietitianId=x'),'pending'),
  nativeStaffDashboardRoute(request('?dietitianId=y'),'pending'),
 ]);
 expect(nativePendingPlans).toHaveBeenCalledTimes(3);
 expect(await Promise.all(responses.map(r=>r.json()))).toEqual([{actor:'actor-a',scope:'x'},{actor:'actor-b',scope:'x'},{actor:'actor-a',scope:'y'}]);
});

test('unauthenticated requests are rejected before loading dashboard data',async()=>{
 (getServerSession as jest.Mock).mockResolvedValue(null);
 expect((await nativeStaffDashboardRoute(request(),'dietitian')).status).toBe(401);
 expect(nativeStaffStats).not.toHaveBeenCalled();
});
