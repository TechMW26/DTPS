import {randomBytes,createHash} from 'node:crypto';
import {NextRequest} from 'next/server';
import {getServerSession} from 'next-auth';
import {getNativeDatabase} from '@/lib/db/database';
import {POST} from '@/app/api/fcm/token/route';
jest.mock('next-auth',()=>({getServerSession:jest.fn()}));
jest.mock('@/lib/auth/config',()=>({authOptions:{}}));
const suite=process.env.DTPS_MONGODB_LOCAL_TEST?describe:describe.skip;
suite('native authenticated device timezone registration',()=>{
 let db:ReturnType<typeof getNativeDatabase>,id:string,token:string;
 beforeAll(async()=>{db=getNativeDatabase();await db.collection('_nativeMigrationState').doc('fcmTokens').set({complete:true});});beforeEach(async()=>{id=randomBytes(12).toString('hex');token='synthetic-'+id;await db.collection('users').doc(id).set({role:'client',status:'active',fcmTokens:[]});jest.mocked(getServerSession).mockResolvedValue({user:{id}} as any);});afterEach(async()=>{await db.collection('users').doc(id).delete();await db.collection('_nativeFcmTokens').doc(createHash('sha256').update(token).digest('hex')).delete();});afterAll(async()=>{await db.collection('_nativeMigrationState').doc('fcmTokens').delete();await db.terminate();});
 const request=(timeZone:string)=>new NextRequest('http://localhost/api/fcm/token',{method:'POST',body:JSON.stringify({token,deviceType:'android',timeZone})});
 it('stores a validated timezone and rejects invalid or unauthenticated changes',async()=>{expect((await POST(request('America/New_York'))).status).toBe(200);expect((await db.collection('users').doc(id).get()).get('notificationTimeZone')).toBe('America/New_York');expect((await POST(request('invalid-zone'))).status).toBe(400);jest.mocked(getServerSession).mockResolvedValue(null);expect((await POST(request('Asia/Kolkata'))).status).toBe(401);expect((await db.collection('users').doc(id).get()).get('fcmTokens')).toHaveLength(1);});
});
