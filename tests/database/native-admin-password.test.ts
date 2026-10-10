import {randomBytes} from 'node:crypto';
import bcrypt from 'bcryptjs';
import {getNativeDatabase} from '@/lib/db/database';
import {adminResetNativePassword} from '@/lib/db/repository/native-account';
const suite=process.env.DTPS_MONGODB_LOCAL_TEST?describe:describe.skip;
suite('native administrator password reset',()=>{
 let db:ReturnType<typeof getNativeDatabase>;beforeAll(()=>{db=getNativeDatabase();});afterAll(async()=>{await db.terminate();});
 it('hashes the password, consumes reset credentials and revokes existing sessions',async()=>{
  const admin=db.collection('users').doc(randomBytes(12).toString('hex')),user=db.collection('users').doc(randomBytes(12).toString('hex'));
  await admin.set({role:'admin',status:'active'});await user.set({role:'client',passwordResetToken:'old-token',passwordResetTokenExpiry:new Date()});
  await adminResetNativePassword(db,admin.id,user.id,'Synthetic-test-42');const row=await user.get();expect(await bcrypt.compare('Synthetic-test-42',row.get('password'))).toBe(true);expect(row.get('passwordResetToken')).toBeUndefined();expect(row.get('logoutOtherSessionsAt')).toBeDefined();
  await admin.update({role:'client'});await expect(adminResetNativePassword(db,admin.id,user.id,'Different-test-42')).rejects.toMatchObject({status:403});expect((await user.get()).get('password')).toBe(row.get('password'));
  const audit=await db.collection('adminauditlogs').where('targetUserId','==',user.id).get();expect(audit.size).toBe(1);expect(JSON.stringify(audit.docs[0].data())).not.toContain('Synthetic-test-42');for(const entry of audit.docs)await entry.ref.delete();await admin.delete();await user.delete();
 });
});
