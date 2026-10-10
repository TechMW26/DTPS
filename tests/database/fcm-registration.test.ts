import type * as MongoTypes from '@/lib/db/mongo-types';
import {randomBytes,createHash} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/database';
import {registerFCMToken,sendNotificationToUser} from '@/lib/firebase/firebaseNotification';
import {getMessaging} from '@/lib/firebase/firebaseAdmin';
jest.mock('@/lib/firebase/firebaseAdmin',()=>({getMessaging:jest.fn(),getNativeMessaging:jest.fn()}));
const suite=process.env.DTPS_MONGODB_LOCAL_TEST?describe:describe.skip;
suite('FCM service on native MongoDB',()=>{
 let db:ReturnType<typeof getNativeDatabase>;const refs:MongoTypes.DocumentReference[]=[];
 beforeAll(()=>{db=getNativeDatabase();});
 afterAll(async()=>{for(const ref of refs)await ref.delete();await db.terminate();});
 it('moves a token without rewriting unrelated users and never delivers pushes during local testing',async()=>{
  const [owner,previous,unrelated]=Array.from({length:3},()=>db.collection('users').doc(randomBytes(12).toString('hex')));
  refs.push(owner,previous,unrelated);
  const token='synthetic-'+randomBytes(12).toString('hex'),unchangedAt=new Date('2025-01-01');
  const index=db.collection('_nativeFcmTokens').doc(createHash('sha256').update(token).digest('hex'));
  const marker=db.collection('_nativeMigrationState').doc('fcmTokens');refs.push(index,marker);
  await Promise.all([owner.set({fcmTokens:[],updatedAt:unchangedAt}),previous.set({fcmTokens:[{token}],updatedAt:unchangedAt}),unrelated.set({fcmTokens:[{token:'other'}],updatedAt:unchangedAt}),index.set({ownerIds:[previous.id]}),marker.set({complete:true})]);
  expect((await registerFCMToken(owner.id,token)).success).toBe(true);
  expect((await previous.get()).get('fcmTokens')).toHaveLength(0);
  expect((await owner.get()).get('fcmTokens')).toHaveLength(1);
  expect((await unrelated.get()).get('updatedAt').toDate()).toEqual(unchangedAt);
  await registerFCMToken(owner.id,token);expect((await owner.get()).get('fcmTokens')).toHaveLength(1);
  expect((await sendNotificationToUser(owner.id,{title:'test',body:'test',saveToDb:false})).errorCode).toBe('LOCAL_DELIVERY_DISABLED');
  expect(getMessaging).not.toHaveBeenCalled();
 });
});
