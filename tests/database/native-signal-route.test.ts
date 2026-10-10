import {randomBytes} from 'node:crypto';
import {NextRequest} from 'next/server';
import {getServerSession} from 'next-auth';
import {getNativeDatabase} from '@/lib/db/database';
import {POST,GET} from '@/app/api/webrtc/signal/route';
jest.mock('next-auth',()=>({getServerSession:jest.fn()}));
jest.mock('@/lib/auth/config',()=>({authOptions:{}}));
jest.mock('@/lib/firebase/firebaseNotification',()=>({sendNotificationToUser:jest.fn()}));
const suite=process.env.DTPS_MONGODB_LOCAL_TEST?describe:describe.skip;
suite('native signal polling delivery',()=>{
 let db:ReturnType<typeof getNativeDatabase>,staff:string,client:string;
 beforeAll(()=>{db=getNativeDatabase();});
 beforeEach(async()=>{staff=randomBytes(12).toString('hex');client=randomBytes(12).toString('hex');await db.collection('users').doc(staff).set({role:'dietitian',status:'active'});await db.collection('users').doc(client).set({role:'client',status:'active',assignedDietitian:staff});});
 afterEach(async()=>{await db.collection('users').doc(staff).delete();await db.collection('users').doc(client).delete();for(const collection of ['realtimesignals','_nativeCalls','_nativeRealtimeEvents'])for(const row of(await db.collection(collection).get()).docs)await row.ref.delete();});afterAll(async()=>{await db.terminate();});
 const session=(id:string)=>jest.mocked(getServerSession).mockResolvedValue({user:{id,firstName:'Synthetic',lastName:'User'}} as any);
 const request=(body:any)=>new NextRequest('http://localhost/api/webrtc/signal',{method:'POST',body:JSON.stringify(body)});
 it('queues only for the recipient and acknowledges a signal once',async()=>{
  session(staff);const response=await POST(request({callId:'synthetic-'+client,receiverId:client,type:'audio',offer:{type:'offer',sdp:'synthetic'}}));expect(response.status).toBe(200);
  session(staff);expect((await (await GET()).json()).signals).toEqual([]);
  session(client);const first=await GET();expect(first.headers.get('cache-control')).toBe('no-store');expect((await first.json()).signals).toEqual([expect.objectContaining({type:'incoming_call',data:expect.objectContaining({callerId:staff})})]);expect((await (await GET()).json()).signals).toEqual([]);
  await db.collection('users').doc(client).update({status:'inactive'});expect((await GET()).status).toBe(403);
  expect(jest.requireMock('@/lib/firebase/firebaseNotification').sendNotificationToUser).not.toHaveBeenCalled();
 });
 it('rejects invalid recipients and oversized payloads before persisting a call',async()=>{session(staff);expect((await POST(request({callId:'invalid',receiverId:'bad',type:'video'}))).status).toBe(400);expect((await POST(request({callId:'too-large',receiverId:client,type:'video',offer:'x'.repeat(100001)}))).status).toBe(400);expect((await db.collection('_nativeCalls').where('callerId','==',staff).get()).empty).toBe(true);});
});
