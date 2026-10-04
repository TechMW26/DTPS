import {randomBytes,createHash} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {registerNativePushToken,removeNativePushTokens,saveNativeNotifications} from '@/lib/db/repository/native-notifications';
const suite=process.env.FIRESTORE_EMULATOR_HOST?describe:describe.skip;
suite('native notification storage',()=>{
 let db:ReturnType<typeof getNativeDatabase>;const refs:FirebaseFirestore.DocumentReference[]=[];
 beforeAll(async()=>{db=getNativeDatabase();const ref=db.collection('_nativeMigrationState').doc('fcmTokens');refs.push(ref);await ref.set({complete:true});});
 afterAll(async()=>{for(const ref of refs)await ref.delete();await db.terminate();});
 async function user(){const ref=db.collection('users').doc(randomBytes(12).toString('hex'));refs.push(ref);await ref.set({fcmTokens:[]});return ref;}
 it('moves tokens atomically between accounts and preserves unrelated registrations',async()=>{
  const one=await user(),two=await user(),token='synthetic-'+randomBytes(12).toString('hex');
  const key=createHash('sha256').update(token).digest('hex');refs.push(db.collection('_nativeFcmTokens').doc(key));
  await registerNativePushToken(db,one.id,token,'web');
  await registerNativePushToken(db,two.id,token,'android');
  expect((await one.get()).get('fcmTokens')).toEqual([]);
  expect((await two.get()).get('fcmTokens')[0]).toMatchObject({token,deviceType:'android'});
  await removeNativePushTokens(db,one.id,[token]);
  expect((await two.get()).get('fcmTokens')).toHaveLength(1);
  await removeNativePushTokens(db,two.id,[token]);expect((await two.get()).get('fcmTokens')).toEqual([]);
 });
 it('creates one persisted unread notification per unique recipient',async()=>{
  const ids=await saveNativeNotifications(db,['synthetic','synthetic'],{title:'test',message:'test',type:'system',actionUrl:undefined});
  expect(ids).toHaveLength(1);const ref=db.collection('notifications').doc(ids[0]);refs.push(ref);
  expect((await ref.get()).data()).toMatchObject({userId:'synthetic',read:false,title:'test'});
 });
});
