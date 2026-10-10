import {randomUUID} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/database';
import {authOptions,invalidateUserStatusCache} from '@/lib/auth/config';
const suite=process.env.DTPS_MONGODB_LOCAL_TEST?describe:describe.skip;
suite('NextAuth native database callbacks',()=>{
 let db:ReturnType<typeof getNativeDatabase>;const id=randomUUID(),email=id+'@example.invalid';
 beforeAll(async()=>{db=getNativeDatabase();await db.collection('users').doc(id).set({email,password:'synthetic-password',firstName:'Synthetic',lastName:'Client',status:'active',role:'client'});});
 afterAll(async()=>{await db.collection('users').doc(id).delete();for(const doc of (await db.collection('activitylogs').where('userId','==',id).get()).docs)await doc.ref.delete();await db.terminate();});
 it('runs credentials login, JWT and session callbacks entirely through Firestore',async()=>{
  const authorize=(authOptions.providers[0] as any).options.authorize;
  const user=await authorize({email,password:'synthetic-password',loginContext:'client'},{headers:{host:'localhost:3002','user-agent':'synthetic-test'}});
  expect(user).toMatchObject({id,role:'client',firstName:'Synthetic'});expect(user).not.toHaveProperty('password');
  const token=await (authOptions.callbacks!.jwt as any)({token:{sub:id},user});
  const session=await (authOptions.callbacks!.session as any)({session:{user:{},expires:new Date(Date.now()+60000).toISOString()},token});
  expect(session.user.id).toBe(id);expect(session.user.role).toBe('client');
  const attempted=await (authOptions.callbacks!.jwt as any)({token,user:undefined,trigger:'update',session:{role:'admin',sub:'another-user',onboardingCompleted:true}});
  expect(attempted.role).toBe('client');expect(attempted.sub).toBe(id);expect(attempted.onboardingCompleted).toBe(false);
  await db.collection('users').doc(id).update({status:'inactive'});invalidateUserStatusCache(id);
  const denied=await (authOptions.callbacks!.session as any)({session:{user:{}},token});expect(denied.user).toEqual({});
 });
});
