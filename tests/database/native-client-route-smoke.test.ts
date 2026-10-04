import {randomBytes} from 'node:crypto';
import {NextRequest} from 'next/server';
import {getNativeDatabase} from '@/lib/db/firestore-native';
const mockSession=jest.fn();jest.mock('next-auth',()=>({getServerSession:()=>mockSession()}));jest.mock('@/lib/auth',()=>({authOptions:{}}));jest.mock('@/lib/auth/config',()=>({authOptions:{}}));
const suite=process.env.FIRESTORE_EMULATOR_HOST?describe:describe.skip;
const endpoints=['profile','progress','notifications/unread-count','dashboard-summary','notifications','service-plans','tasks','meal-plan','billing','subscriptions','bmi','hydration','steps','sleep','activity','dietary-recall'];
suite('phone-only client native route reads',()=>{
 let db:ReturnType<typeof getNativeDatabase>;const id=randomBytes(12).toString('hex');
 beforeAll(async()=>{db=getNativeDatabase();await db.collection('users').doc(id).set({_id:id,role:'client',status:'active',firstName:'Synthetic',lastName:'Phone-only',phone:'+919999999998',heightCm:'170',weightKg:'65',onboardingCompleted:true});mockSession.mockResolvedValue({user:{id,role:'client'}});});
 afterAll(async()=>{await db.collection('users').doc(id).delete();await db.terminate();});
 it.each(endpoints)('%s works without email and does not mutate the client record',async endpoint=>{const before=await db.collection('users').doc(id).get();const route=await import('@/app/api/client/'+endpoint+'/route');const response=await route.GET(new NextRequest('http://localhost/api/client/'+endpoint));expect(response.status).toBe(200);expect(await response.json()).toBeDefined();expect((await db.collection('users').doc(id).get()).updateTime?.isEqual(before.updateTime!)).toBe(true);});
});
