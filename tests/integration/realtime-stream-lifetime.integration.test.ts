import {NextRequest} from 'next/server';
import {GET} from '@/app/api/realtime/events/route';
import {getServerSession} from 'next-auth';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {nativeRealtimeActor} from '@/lib/realtime/native-events';
jest.mock('next-auth',()=>({getServerSession:jest.fn()}));
jest.mock('@/lib/auth/config',()=>({authOptions:{}}));
jest.mock('@/lib/db/firestore-native',()=>({getNativeDatabase:jest.fn()}));
jest.mock('@/lib/realtime/native-events',()=>({nativeRealtimeActor:jest.fn(),realtimeTargets:()=>['user:test']}));
jest.mock('@/lib/realtime/native-presence',()=>({touchNativePresence:jest.fn(async()=>{})}));

describe('longer realtime streams',()=>{
 let revoke:(doc:any)=>void;
 let unsubUser:jest.Mock,unsubEvents:jest.Mock;
 beforeEach(()=>{
  jest.useFakeTimers();unsubUser=jest.fn();unsubEvents=jest.fn();
  (getServerSession as jest.Mock).mockResolvedValue({user:{id:'test'}});
  (nativeRealtimeActor as jest.Mock).mockResolvedValue({id:'test',role:'admin'});
  const query:any={where:()=>query,orderBy:()=>query,onSnapshot:()=>unsubEvents};
  (getNativeDatabase as jest.Mock).mockReturnValue({collection:(name:string)=>name==='users'?{doc:()=>({onSnapshot:(fn:any)=>{revoke=fn;return unsubUser;}})}:query});
 });
 afterEach(()=>jest.useRealTimers());
 it('keeps one connection past the old deadline and releases listeners at the new deadline',async()=>{
  const res=await GET(new NextRequest('https://dtps.tech/api/realtime/events'));
  expect(res.status).toBe(200);
  await jest.advanceTimersByTimeAsync(60000);
  expect(unsubEvents).not.toHaveBeenCalled();
  await jest.advanceTimersByTimeAsync(180000);
  expect(unsubEvents).toHaveBeenCalledTimes(1);expect(unsubUser).toHaveBeenCalledTimes(1);
 });
 it('still closes immediately when permission is revoked',async()=>{
  await GET(new NextRequest('https://dtps.tech/api/realtime/events'));
  revoke({exists:true,get:(key:string)=>key==='role'?'client':undefined});
  expect(unsubEvents).toHaveBeenCalledTimes(1);expect(unsubUser).toHaveBeenCalledTimes(1);
 });
 it('releases listeners when the client disconnects',async()=>{
  const controller=new AbortController();
  await GET(new NextRequest('https://dtps.tech/api/realtime/events',{signal:controller.signal}));
  controller.abort();expect(unsubEvents).toHaveBeenCalledTimes(1);
 });
});
