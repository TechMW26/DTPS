import {randomUUID} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {createNativeAccount,nativePhoneUser,nativeContactExists} from '@/lib/db/repository/native-registration';
const suite=process.env.FIRESTORE_EMULATOR_HOST?describe:describe.skip;
suite('native registration uniqueness',()=>{
 let db:ReturnType<typeof getNativeDatabase>;
 beforeAll(async()=>{db=getNativeDatabase();await db.collection('_nativeCounters').doc('clientIds').set({seq:500});});
 afterAll(async()=>{for(const collection of ['users','_nativeUserKeys','_nativeCounters']){const docs=await db.collection(collection).get();for(const doc of docs.docs)await doc.ref.delete();}await db.terminate();});
 it('allocates unique client numbers and reserves phone/email under concurrent signups',async()=>{
  const input={firstName:'Synthetic',lastName:'Fixture',role:'client',phone:'+15555550123',password:'synthetic',email:randomUUID()+'@example.invalid'};
  const results=await Promise.allSettled([createNativeAccount(db,input),createNativeAccount(db,input)]);
  const successes=results.filter(r=>r.status==='fulfilled');expect(successes).toHaveLength(1);expect(results.filter(r=>r.status==='rejected')).toHaveLength(1);
  const user=(successes[0] as PromiseFulfilledResult<any>).value;expect(user.clientId).toBe('C-501');expect(user).not.toHaveProperty('password');
  expect((await nativePhoneUser(db,input.phone,true))?._id).toBe(user._id);
  expect(await nativeContactExists(db,input.phone)).toBe(true);
  const next=await createNativeAccount(db,{...input,phone:'+15555550124',email:randomUUID()+'@example.invalid'});expect(next.clientId).toBe('C-502');
 });
 it('finds legacy Indian phone formats without rewriting original user data',async()=>{
  const ref=db.collection('users').doc(randomUUID());await ref.set({phone:'9876543210',firstName:'Legacy',role:'client',status:'active'});
  expect((await nativePhoneUser(db,'+919876543210',true))?._id).toBe(ref.id);
 });
});
