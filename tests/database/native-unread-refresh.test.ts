import {getServerSession} from 'next-auth';
import {nativeUnreadMessageCount} from '@/lib/db/repository/native-notifications';
import {socketManager} from '@/lib/realtime/socket-manager';
import {POST} from '@/app/api/staff/unread-counts/refresh/route';
jest.mock('next-auth',()=>({getServerSession:jest.fn()}));
jest.mock('@/lib/auth/config',()=>({authOptions:{}}));
jest.mock('@/lib/db/database',()=>({getNativeDatabase:()=>({})}));
jest.mock('@/lib/db/repository/native-notifications',()=>({nativeUnreadMessageCount:jest.fn()}));
jest.mock('@/lib/realtime/socket-manager',()=>({socketManager:{sendToUser:jest.fn()}}));
test('overlapping refreshes share counts and broadcast, later requests read fresh data',async()=>{
 (getServerSession as jest.Mock).mockResolvedValue({user:{id:'actor-a'}});
 (nativeUnreadMessageCount as jest.Mock).mockImplementation(async()=>{await new Promise(r=>setTimeout(r,10));return 7;});
 const responses=await Promise.all(Array.from({length:5},()=>POST()));
 expect(nativeUnreadMessageCount).toHaveBeenCalledTimes(1);
 expect(socketManager.sendToUser).toHaveBeenCalledTimes(1);
 for(const response of responses)expect(await response.json()).toEqual({success:true,messages:7});
 await POST();expect(nativeUnreadMessageCount).toHaveBeenCalledTimes(2);
});
test('different accounts never share counts',async()=>{
 (getServerSession as jest.Mock).mockResolvedValueOnce({user:{id:'actor-a'}}).mockResolvedValueOnce({user:{id:'actor-b'}});
 (nativeUnreadMessageCount as jest.Mock).mockImplementation(async(_db,id)=>{await new Promise(r=>setTimeout(r,10));return id==='actor-a'?2:9;});
 const responses=await Promise.all([POST(),POST()]);
 expect(await Promise.all(responses.map(r=>r.json()))).toEqual([{success:true,messages:2},{success:true,messages:9}]);
 expect(nativeUnreadMessageCount).toHaveBeenCalledTimes(2);
});
test('unauthenticated requests do not read or broadcast',async()=>{
 (getServerSession as jest.Mock).mockResolvedValue(null);
 expect((await POST()).status).toBe(401);
 expect(nativeUnreadMessageCount).not.toHaveBeenCalled();
 expect(socketManager.sendToUser).not.toHaveBeenCalled();
});
