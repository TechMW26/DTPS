import {getNativeDatabase} from '@/lib/db/database';
import {issueNativeOtp,consumeNativeOtp,cancelNativeOtp} from '@/lib/db/repository/native-otp';
const suite=process.env.DTPS_MONGODB_LOCAL_TEST?describe:describe.skip;
suite('native OTP transactions',()=>{
 let db:ReturnType<typeof getNativeDatabase>;const original=process.env.NEXTAUTH_SECRET;
 beforeAll(()=>{process.env.NEXTAUTH_SECRET='synthetic-emulator-only';db=getNativeDatabase();});
 afterAll(async()=>{for(const collection of ['_nativeOtpChallenges','_nativeOtpLimits']){const docs=await db.collection(collection).get();for(const doc of docs.docs)await doc.ref.delete();}await db.terminate();if(original===undefined)delete process.env.NEXTAUTH_SECRET;else process.env.NEXTAUTH_SECRET=original;});
 it('stores no plaintext code and only one concurrent verification succeeds',async()=>{
  const phone='+15555550131',issued=await issueNativeOtp(db,phone,'login');expect(issued).not.toBeNull();
  const row=(await db.collection('_nativeOtpChallenges').doc(issued!.id).get()).data()!;expect(row.otp).toBeUndefined();expect(row.hash).not.toBe(issued!.otp);
  const attempts=await Promise.all([consumeNativeOtp(db,phone,'login',issued!.otp),consumeNativeOtp(db,phone,'login',issued!.otp)]);expect(attempts.filter(r=>r.ok)).toHaveLength(1);
 });
 it('limits resends even after successful consumption and does not delete a newer challenge',async()=>{
  const phone='+15555550132',first=await issueNativeOtp(db,phone,'signup'),second=await issueNativeOtp(db,phone,'signup');
  await cancelNativeOtp(db,first!.id,first!.nonce);expect((await consumeNativeOtp(db,phone,'signup',second!.otp)).ok).toBe(true);
  for(let i=0;i<3;i++){const next=await issueNativeOtp(db,phone,'signup');expect(next).not.toBeNull();await consumeNativeOtp(db,phone,'signup',next!.otp);}
  expect(await issueNativeOtp(db,phone,'signup')).toBeNull();
 });
 it('enforces attempts and purpose without rolling back failed-attempt counters',async()=>{
  const phone='+15555550133',issued=await issueNativeOtp(db,phone,'signup');
  expect((await consumeNativeOtp(db,phone,'login',issued!.otp)).ok).toBe(false);
  const wrong=issued!.otp==='1000'?'1001':'1000';
  for(let i=0;i<3;i++)expect((await consumeNativeOtp(db,phone,'signup',wrong)).ok).toBe(false);
  expect((await consumeNativeOtp(db,phone,'signup',issued!.otp)).ok).toBe(false);
 });
});
