import {randomUUID} from 'node:crypto';
import bcrypt from 'bcryptjs';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {setNativeResetToken,validateNativeReset,consumeNativeReset,revokeNativeOtherSessions} from '@/lib/db/repository/native-account';
const suite=process.env.FIRESTORE_EMULATOR_HOST?describe:describe.skip;
suite('native account recovery',()=>{
 let db:ReturnType<typeof getNativeDatabase>;const refs:FirebaseFirestore.DocumentReference[]=[];
 beforeAll(()=>{db=getNativeDatabase();});
 afterAll(async()=>{for(const ref of refs)await ref.delete();await db.terminate();});
 it('consumes a valid reset token only once, hashes the password and revokes old sessions',async()=>{
  const email=randomUUID()+'@example.invalid',ref=db.collection('users').doc(randomUUID());refs.push(ref);
  await ref.set({email,role:'client',status:'active',password:'synthetic-old'});
  await setNativeResetToken(db,ref.id,'synthetic-hash',new Date(Date.now()+60000));
  expect(await validateNativeReset(db,email,'wrong')).toBeNull();
  expect(await validateNativeReset(db,email,'synthetic-hash')).not.toBeNull();
  const attempts=await Promise.all([consumeNativeReset(db,email,'synthetic-hash','new-password'),consumeNativeReset(db,email,'synthetic-hash','new-password')]);
  expect(attempts.filter(Boolean)).toHaveLength(1);
  const data=(await ref.get()).data()!;expect(await bcrypt.compare('new-password',data.password)).toBe(true);expect(data.passwordResetToken).toBeUndefined();expect(data.logoutOtherSessionsAt).toBeDefined();
  expect(await validateNativeReset(db,email,'synthetic-hash')).toBeNull();
  await revokeNativeOtherSessions(db,ref.id,'current-device');expect((await ref.get()).get('keepCurrentSessionId')).toBe('current-device');
 });
 it('rejects expired reset tokens without changing stored passwords',async()=>{
  const email=randomUUID()+'@example.invalid',ref=db.collection('users').doc(randomUUID());refs.push(ref);
  await ref.set({email,password:'unchanged',passwordResetToken:'expired',passwordResetTokenExpiry:new Date(0)});
  expect(await consumeNativeReset(db,email,'expired','new')).toBeNull();expect((await ref.get()).get('password')).toBe('unchanged');
 });
});
