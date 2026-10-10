import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import {getNativeDatabase} from '@/lib/db/database';
import {authenticateNativeUser,nativeUserProfile} from '@/lib/db/repository/native-users';

const suite=process.env.DTPS_MONGODB_LOCAL_TEST?describe:describe.skip;
suite('native user authentication (emulator only)',()=>{
  let db:ReturnType<typeof getNativeDatabase>;
  const refs:FirebaseFirestore.DocumentReference[]=[];
  const email=`${randomUUID()}@example.invalid`;
  beforeAll(()=>{db=getNativeDatabase();});
  afterAll(async()=>{for(const ref of refs)await ref.delete();await db.terminate();});
  it('preserves password login without exposing credentials or permitting cross-role login',async()=>{
    const ref=db.collection('users').doc(randomUUID());refs.push(ref);
    await ref.set({email,password:await bcrypt.hash('synthetic-password',4),role:'client',status:'active',firstName:'Test',lastName:'Client',googleCalendarAccessToken:'synthetic-secret'});
    const result=await authenticateNativeUser(db,email.toUpperCase(),'synthetic-password','client');
    expect(result).toMatchObject({_id:ref.id,fullName:'Test Client'});
    expect(result).not.toHaveProperty('password');
    expect(await nativeUserProfile(db,ref.id)).not.toHaveProperty('googleCalendarAccessToken');
    expect(await authenticateNativeUser(db,email,'wrong','client')).toBeNull();
    expect(await authenticateNativeUser(db,email,'synthetic-password','staff')).toBeNull();
    await ref.update({status:'inactive'});
    expect(await authenticateNativeUser(db,email,'synthetic-password','client')).toBeNull();
  });
  it('upgrades legacy plaintext only after successful authentication',async()=>{
    const ref=db.collection('users').doc(randomUUID());refs.push(ref);
    const legacyEmail=`${randomUUID()}@example.invalid`;
    await ref.set({email:legacyEmail,password:'legacy-synthetic',role:'admin',status:'active'});
    expect(await authenticateNativeUser(db,legacyEmail,'wrong','staff')).toBeNull();
    expect((await ref.get()).get('password')).toBe('legacy-synthetic');
    expect(await authenticateNativeUser(db,legacyEmail,'legacy-synthetic','staff')).not.toBeNull();
    expect(await bcrypt.compare('legacy-synthetic',(await ref.get()).get('password'))).toBe(true);
  });
});
